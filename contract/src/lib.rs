//! NEAR Breakeven ledger.
//!
//! The thesis is only as good as its numbers, so the numbers live on NEAR:
//!
//! * `publish_run` (owner only) anchors one run of the evidence pipeline: the
//!   SHA-256 of the pinned data snapshot, the SHA-256 of the computed results,
//!   the four claim results and the verdict. Runs are append-only and strictly
//!   ordered by date, so a past verdict can never be edited or replaced.
//! * `attest` (anyone) records that an account re-ran a published run and
//!   which hashes it got. The contract itself compares them with the anchored
//!   hashes, so "my numbers matched" is decided on chain, not claimed.

use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault};

/// Deposit an attestation must attach. It pays for the attestation's storage.
pub const ATTEST_DEPOSIT: NearToken = NearToken::from_millinear(10);
pub const MAX_NOTE: usize = 140;
pub const MAX_METRICS: usize = 40;
pub const PAGE_MAX: u32 = 100;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Runs,
    Attestations,
    RunAttestations,
    Seen,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Metric {
    pub key: String,
    pub value: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ClaimResult {
    /// "C1" .. "C4"
    pub id: String,
    pub passes: bool,
    pub value: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Run {
    pub id: u32,
    /// Last full UTC day of data, YYYY-MM-DD.
    pub as_of: String,
    /// The mainnet block the chain facts were read at.
    pub source_block: u64,
    pub snapshot_sha256: String,
    pub results_sha256: String,
    /// "HOLDS", "UNDER PRESSURE" or "BROKEN".
    pub verdict: String,
    pub claims: Vec<ClaimResult>,
    pub metrics: Vec<Metric>,
    /// Git commit of the code that produced the run.
    pub code: String,
    pub published_at_ns: u64,
    pub published_block: u64,
    pub attestations: u32,
    pub matching: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Attestation {
    pub run_id: u32,
    pub by: AccountId,
    pub snapshot_sha256: String,
    pub results_sha256: String,
    pub snapshot_matches: bool,
    pub results_matches: bool,
    /// How the attester got their numbers: "snapshot" (from the pinned file) or "live" (re-fetched every source).
    pub method: String,
    pub note: String,
    pub at_ns: u64,
    pub block: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Ledger {
    owner: AccountId,
    runs: Vector<Run>,
    attestations: Vector<Attestation>,
    run_attestations: LookupMap<u32, Vec<u32>>,
    seen: LookupMap<String, u32>,
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn emit(event: &str, data: String) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"nearbreakeven","version":"1.0.0","event":"{event}","data":[{data}]}}"#
    ));
}

#[near]
impl Ledger {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            runs: Vector::new(Key::Runs),
            attestations: Vector::new(Key::Attestations),
            run_attestations: LookupMap::new(Key::RunAttestations),
            seen: LookupMap::new(Key::Seen),
        }
    }

    /// Anchors a run. Owner only. Dates must strictly increase, so history is append-only.
    #[allow(clippy::too_many_arguments)]
    pub fn publish_run(
        &mut self,
        as_of: String,
        source_block: u64,
        snapshot_sha256: String,
        results_sha256: String,
        verdict: String,
        claims: Vec<ClaimResult>,
        metrics: Vec<Metric>,
        code: String,
    ) -> u32 {
        require!(env::predecessor_account_id() == self.owner, "only the owner publishes runs");
        require!(is_date(&as_of), "as_of must be YYYY-MM-DD");
        require!(is_sha256_hex(&snapshot_sha256), "snapshot_sha256 must be 64 lowercase hex characters");
        require!(is_sha256_hex(&results_sha256), "results_sha256 must be 64 lowercase hex characters");
        require!(
            matches!(verdict.as_str(), "HOLDS" | "UNDER PRESSURE" | "BROKEN"),
            "verdict must be HOLDS, UNDER PRESSURE or BROKEN"
        );
        require!(claims.len() == 4, "a run has exactly four claims");
        require!(metrics.len() <= MAX_METRICS, "too many metrics");
        require!(code.len() <= 64, "code must be a git commit");
        if let Some(last) = self.runs.len().checked_sub(1).and_then(|i| self.runs.get(i)) {
            require!(as_of > last.as_of, "runs are append-only: as_of must be after the latest run");
        }
        let id = self.runs.len();
        let run = Run {
            id,
            as_of,
            source_block,
            snapshot_sha256,
            results_sha256,
            verdict,
            claims,
            metrics,
            code,
            published_at_ns: env::block_timestamp(),
            published_block: env::block_height(),
            attestations: 0,
            matching: 0,
        };
        emit(
            "run_published",
            format!(
                r#"{{"run_id":{},"as_of":"{}","verdict":"{}","results_sha256":"{}"}}"#,
                id, run.as_of, run.verdict, run.results_sha256
            ),
        );
        self.runs.push(run);
        id
    }

    /// Records that the caller re-ran `run_id` and got these hashes. One attestation per account per run.
    #[payable]
    pub fn attest(
        &mut self,
        run_id: u32,
        snapshot_sha256: String,
        results_sha256: String,
        method: String,
        note: Option<String>,
    ) -> Attestation {
        require!(
            env::attached_deposit() >= ATTEST_DEPOSIT,
            "attach 0.01 NEAR to pay for the attestation's storage"
        );
        require!(is_sha256_hex(&snapshot_sha256), "snapshot_sha256 must be 64 lowercase hex characters");
        require!(is_sha256_hex(&results_sha256), "results_sha256 must be 64 lowercase hex characters");
        require!(matches!(method.as_str(), "snapshot" | "live"), "method must be snapshot or live");
        let note = note.unwrap_or_default();
        require!(note.chars().count() <= MAX_NOTE, "note is limited to 140 characters");
        let by = env::predecessor_account_id();
        let key = format!("{run_id}:{by}");
        require!(!self.seen.contains_key(&key), "this account already attested this run");
        let mut run = self.runs.get(run_id).cloned().unwrap_or_else(|| env::panic_str("no such run"));

        let att = Attestation {
            run_id,
            by,
            snapshot_matches: snapshot_sha256 == run.snapshot_sha256,
            results_matches: results_sha256 == run.results_sha256,
            snapshot_sha256,
            results_sha256,
            method,
            note,
            at_ns: env::block_timestamp(),
            block: env::block_height(),
        };
        run.attestations += 1;
        if att.results_matches {
            run.matching += 1;
        }
        self.runs.set(run_id, run);

        let index = self.attestations.len();
        self.attestations.push(att.clone());
        let mut list = self.run_attestations.get(&run_id).cloned().unwrap_or_default();
        list.push(index);
        self.run_attestations.insert(run_id, list);
        self.seen.insert(key, index);
        emit(
            "run_attested",
            format!(
                r#"{{"run_id":{},"by":"{}","results_matches":{},"snapshot_matches":{}}}"#,
                run_id, att.by, att.results_matches, att.snapshot_matches
            ),
        );
        att
    }

    // ---------- views ----------

    pub fn get_owner(&self) -> &AccountId {
        &self.owner
    }

    pub fn run_count(&self) -> u32 {
        self.runs.len()
    }

    pub fn get_run(&self, run_id: u32) -> Option<&Run> {
        self.runs.get(run_id)
    }

    pub fn latest_run(&self) -> Option<&Run> {
        self.runs.len().checked_sub(1).and_then(|i| self.runs.get(i))
    }

    /// Newest first.
    pub fn list_runs(&self, from: Option<u32>, limit: Option<u32>) -> Vec<&Run> {
        let len = self.runs.len();
        let skip = from.unwrap_or(0);
        let limit = limit.unwrap_or(20).min(PAGE_MAX);
        (0..len).rev().skip(skip as usize).take(limit as usize).filter_map(|i| self.runs.get(i)).collect()
    }

    /// Newest first.
    pub fn list_attestations(&self, run_id: u32, from: Option<u32>, limit: Option<u32>) -> Vec<&Attestation> {
        let Some(list) = self.run_attestations.get(&run_id) else { return vec![] };
        let limit = limit.unwrap_or(20).min(PAGE_MAX);
        list.iter()
            .rev()
            .skip(from.unwrap_or(0) as usize)
            .take(limit as usize)
            .filter_map(|i| self.attestations.get(*i))
            .collect()
    }

    pub fn get_attestation(&self, run_id: u32, account_id: AccountId) -> Option<&Attestation> {
        self.seen.get(&format!("{run_id}:{account_id}")).and_then(|i| self.attestations.get(*i))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::testing_env;

    const H1: &str = "784a00b915b0fd20b1c06abc6f826408f68e367b1d8dec7f23d247548c053be3";
    const H2: &str = "7ef91d4c95a119a3a5c081e768d14fc66ef97029d356c76d5761043b6357f179";
    const H3: &str = "0000000000000000000000000000000000000000000000000000000000000001";

    fn acct(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(who: &str, deposit: NearToken) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(acct(who))
            .attached_deposit(deposit)
            .block_timestamp(1_794_566_027_000_000_000)
            .build());
    }

    fn claims() -> Vec<ClaimResult> {
        ["C1", "C2", "C3", "C4"]
            .iter()
            .map(|id| ClaimResult { id: id.to_string(), passes: true, value: "1".into() })
            .collect()
    }

    fn publish(l: &mut Ledger, as_of: &str) -> u32 {
        l.publish_run(
            as_of.into(),
            224_351_751,
            H1.into(),
            H2.into(),
            "HOLDS".into(),
            claims(),
            vec![Metric { key: "coverage30".into(), value: "0.1566".into() }],
            "caf6573".into(),
        )
    }

    fn ledger() -> Ledger {
        ctx("owner.testnet", NearToken::from_near(0));
        Ledger::new(acct("owner.testnet"))
    }

    #[test]
    fn owner_publishes_and_reads_back() {
        let mut l = ledger();
        assert_eq!(publish(&mut l, "2026-11-12"), 0);
        let run = l.latest_run().unwrap();
        assert_eq!(run.as_of, "2026-11-12");
        assert_eq!(run.results_sha256, H2);
        assert_eq!(l.run_count(), 1);
        assert!(get_logs()[0].contains(r#""event":"run_published""#));
    }

    #[test]
    #[should_panic(expected = "only the owner publishes runs")]
    fn stranger_cannot_publish() {
        let mut l = ledger();
        ctx("mallory.testnet", NearToken::from_near(0));
        publish(&mut l, "2026-11-12");
    }

    #[test]
    #[should_panic(expected = "runs are append-only")]
    fn history_cannot_be_rewritten() {
        let mut l = ledger();
        publish(&mut l, "2026-11-12");
        publish(&mut l, "2026-11-12");
    }

    #[test]
    #[should_panic(expected = "snapshot_sha256 must be 64 lowercase hex characters")]
    fn rejects_bad_hash() {
        let mut l = ledger();
        l.publish_run("2026-11-12".into(), 1, "XYZ".into(), H2.into(), "HOLDS".into(), claims(), vec![], "c".into());
    }

    #[test]
    #[should_panic(expected = "verdict must be HOLDS, UNDER PRESSURE or BROKEN")]
    fn rejects_unknown_verdict() {
        let mut l = ledger();
        l.publish_run("2026-11-12".into(), 1, H1.into(), H2.into(), "MOON".into(), claims(), vec![], "c".into());
    }

    #[test]
    fn contract_decides_whether_a_rerun_matched() {
        let mut l = ledger();
        publish(&mut l, "2026-11-12");
        ctx("judge.testnet", ATTEST_DEPOSIT);
        let ok = l.attest(0, H1.into(), H2.into(), "live".into(), Some("same numbers".into()));
        assert!(ok.results_matches && ok.snapshot_matches);
        ctx("skeptic.testnet", ATTEST_DEPOSIT);
        let bad = l.attest(0, H3.into(), H3.into(), "live".into(), None);
        assert!(!bad.results_matches && !bad.snapshot_matches);
        let run = l.get_run(0).unwrap();
        assert_eq!((run.attestations, run.matching), (2, 1));
        let list = l.list_attestations(0, None, None);
        assert_eq!(list[0].by, acct("skeptic.testnet"));
        assert_eq!(l.get_attestation(0, acct("judge.testnet")).unwrap().note, "same numbers");
    }

    #[test]
    #[should_panic(expected = "this account already attested this run")]
    fn one_attestation_per_account() {
        let mut l = ledger();
        publish(&mut l, "2026-11-12");
        ctx("judge.testnet", ATTEST_DEPOSIT);
        l.attest(0, H1.into(), H2.into(), "snapshot".into(), None);
        l.attest(0, H1.into(), H2.into(), "snapshot".into(), None);
    }

    #[test]
    #[should_panic(expected = "attach 0.01 NEAR")]
    fn attestation_pays_for_storage() {
        let mut l = ledger();
        publish(&mut l, "2026-11-12");
        ctx("judge.testnet", NearToken::from_millinear(1));
        l.attest(0, H1.into(), H2.into(), "snapshot".into(), None);
    }

    #[test]
    #[should_panic(expected = "no such run")]
    fn cannot_attest_a_missing_run() {
        let mut l = ledger();
        ctx("judge.testnet", ATTEST_DEPOSIT);
        l.attest(7, H1.into(), H2.into(), "snapshot".into(), None);
    }

    #[test]
    fn runs_list_newest_first() {
        let mut l = ledger();
        publish(&mut l, "2026-11-11");
        publish(&mut l, "2026-11-12");
        let runs = l.list_runs(None, None);
        assert_eq!(runs.iter().map(|r| r.as_of.as_str()).collect::<Vec<_>>(), ["2026-11-12", "2026-11-11"]);
    }
}
