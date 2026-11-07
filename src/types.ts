/** BTT-1 LOCAL declaration draft. Not implemented or approved product code.
 * Future repo path: src/types.ts. CONTRACT.md §§3–9 and decision 0001 control.
 * CSV mapping settled by PO inspection; see CONTRACT.md §5.1. Gameplay answers ship.
 * Validate unknown at all input boundaries; brands are never created by casts.
 */
export type CountyId = string & { readonly __brand: "CountyId" };
export type RegionId = string & { readonly __brand: "RegionId" };
export type QuestionId = string & { readonly __brand: "QuestionId" };
export type ClaimId = string & { readonly __brand: "ClaimId" };
export type PlayerId = 0 | 1 | 2 | 3 | 4 | 5;
export type PlayerCount = 2 | 3 | 4 | 5 | 6;
export type Rng = () => number; // validated [0,1); adapter retains serializable state
export type Point = readonly [number, number];
export type Mode = "total92" | "quick60";
export interface Player {
  readonly id: PlayerId;
  readonly label: string;
  readonly kind: "human" | "computer";
}
export interface County {
  readonly id: CountyId;
  readonly name: string;
  readonly path: string;
  readonly centroid: Point;
  readonly neighbors: readonly CountyId[];
  readonly regionId: RegionId;
  /** Supplied POI fields; no independent fact-check prerequisite for CSV import. */
  readonly facts: readonly CountyFact[];
}
export interface CountyFact {
  readonly label: string;
  readonly text: string;
  readonly claimIds?: readonly ClaimId[]; // deferred, not an import requirement
}
export interface Region {
  readonly id: RegionId;
  readonly name: string;
  readonly counties: readonly CountyId[];
  readonly borderPath: string;
  readonly bonus: number; // region values OPEN; no invented formula or placeholder value
  readonly review: "draft" | "reviewed";
}
export interface MapPack {
  readonly version: 1;
  readonly id: "indiana";
  readonly digest: string;
  readonly viewBox: readonly [number, number, number, number];
  readonly outline: string;
  readonly counties: readonly County[];
  readonly regions: readonly Region[];
}
export type ChoiceLetter = "A" | "B" | "C" | "D";
/** Parsed from the exact supplied CSV headers; no invented ingress columns. */
export interface CsvQuestionRow {
  readonly "Q#": string;
  readonly FIPS: string;
  readonly County: string;
  readonly "County Seat": string;
  readonly Established: string;
  readonly "Named For": string;
  readonly Category: string;
  readonly Question: string;
  readonly "Choice A": string;
  readonly "Choice B": string;
  readonly "Choice C": string;
  readonly "Choice D": string;
  readonly "Correct Letter": ChoiceLetter;
  readonly "Correct Answer": string;
  readonly Explanation: string;
}
/** Output mapped directly from supplied fields; no fact-check prerequisite. */
export interface QuizQuestion {
  readonly kind: "multipleChoice";
  readonly id: QuestionId; // Q#, stable supplied identifier
  readonly countyId: CountyId; // FIPS, also the QuizPack.counties key
  readonly countyName: string;
  readonly countySeat: string;
  readonly established: number; // supplied integer, validated structurally
  readonly namedFor: string;
  readonly category: string;
  readonly prompt: string;
  readonly choices: Readonly<Record<ChoiceLetter, string>>; // exactly A/B/C/D
  readonly correctLetter: ChoiceLetter;
  readonly correctAnswer: string; // equals choices[correctLetter]
  readonly explanation?: string; // preserve if present; display optional
}
export interface QuizPack {
  readonly version: 1;
  readonly mapDigest: string;
  readonly sourceDigest: string;
  readonly counties: Readonly<Record<CountyId, readonly QuizQuestion[]>>;
}
export interface SourceRow {
  readonly fileDigest: string;
  readonly rowNumber: number; // documented 1-based source record ordinal
}
export interface CsvMapping {
  readonly countyHeader: "FIPS";
  readonly questionHeader: "Question";
  readonly answerHeader: "Correct Answer";
  readonly correctLetterHeader: "Correct Letter";
  readonly choiceHeaders: readonly ["Choice A", "Choice B", "Choice C", "Choice D"];
}
/** DEFERRED ledger declarations: never prerequisites for current CSV import. */
export interface Claim {
  readonly id: ClaimId;
  readonly countyId: CountyId;
  readonly questionId: QuestionId;
  readonly text: string;
  readonly sourceRow: SourceRow;
}
export interface ConvertedQuestion {
  readonly question: QuizQuestion;
  readonly sourceRow: SourceRow;
}
export type EvidenceUrls = readonly [string, ...string[]];
export type Verdict = {
  readonly claimId: ClaimId;
  readonly checkerId: string; // offline attribution only, not client player id
  readonly note: string;
} & (
  | { readonly kind: "confirmed"; readonly evidenceUrls: EvidenceUrls }
  | {
      readonly kind: "corrected";
      readonly evidenceUrls: EvidenceUrls;
      readonly correction: string;
    }
  | { readonly kind: "false"; readonly evidenceUrls: readonly string[] }
  | { readonly kind: "unconfirmed"; readonly evidenceUrls: readonly string[] }
);
export interface Resolution {
  readonly claimId: ClaimId;
  readonly decision: "ship" | "reject";
  readonly personRef: string; // supplied person ruling; never invented by assembler
  readonly reason: string;
}
export interface Coverage {
  readonly countyId: CountyId;
  readonly supplied: number;
  readonly imported: number;
  readonly categories: readonly string[];
  readonly issues: readonly string[];
}
export interface GameConfig {
  readonly players: readonly Player[]; // parser enforces 2–6 unique contiguous ids
  readonly mode: Mode;
  readonly map: MapPack;
  readonly quiz: QuizPack;
  // No configurable quizBonus or secondPlayerExtra.
}
export interface Holding {
  readonly countyId: CountyId;
  readonly owner: PlayerId;
  readonly armies: number; // >=1 except pending occupation's zero-army target
}
export type AnswerToken = { readonly kind: "choice"; readonly index: number }; // displayed index, mapped to original A/B/C/D
export type QuizResult = "correct" | "wrong" | "skipped" | "noQuestion";
export interface PendingQuestion {
  readonly questionId: QuestionId;
  readonly countyId: CountyId;
  readonly turnSequence: number;
  /** Displayed index -> original supplied letter, permutation of A/B/C/D. */
  readonly choiceOrder: readonly [ChoiceLetter, ChoiceLetter, ChoiceLetter, ChoiceLetter];
}
export interface Income {
  readonly base: number;
  readonly regions: number;
  readonly quiz: 0 | 2;
}
export type Phase =
  | {
      readonly kind: "quiz";
      readonly pending: PendingQuestion;
      readonly baseIncome: number;
      readonly regionIncome: number;
    }
  | {
      readonly kind: "place";
      readonly remaining: number;
      readonly income: Income;
      readonly quizResult: QuizResult;
    }
  | { readonly kind: "attack" }
  | {
      readonly kind: "occupy";
      readonly from: CountyId;
      readonly to: CountyId;
      readonly minimum: 1 | 2 | 3;
      readonly previousOwner: PlayerId;
    }
  | { readonly kind: "fortify" }
  | { readonly kind: "handoff"; readonly nextPlayer: PlayerId }
  | { readonly kind: "over"; readonly winner: PlayerId; readonly mode: Mode };
export interface AskedQuestions {
  readonly countyId: CountyId;
  readonly questionIds: readonly QuestionId[];
}
export type GameEvent = {
  readonly turnSequence: number;
  readonly player: PlayerId;
} & (
  | { readonly kind: "phase"; readonly phase: Phase["kind"] }
  | {
      readonly kind: "quizResolved";
      readonly result: QuizResult;
      readonly countyId: CountyId | null; // null only if no owned pool is usable
      readonly bonus: 0 | 2;
    }
  | {
      readonly kind: "battle";
      readonly from: CountyId;
      readonly to: CountyId;
      readonly attackRolls: readonly number[];
      readonly defenseRolls: readonly number[];
      readonly attackLosses: number;
      readonly defenseLosses: number;
    }
  | { readonly kind: "capture"; readonly countyId: CountyId; readonly moved: number }
  | { readonly kind: "winner"; readonly mode: Mode }
);
export interface GameState {
  readonly version: 1;
  readonly config: GameConfig;
  readonly activePlayer: PlayerId;
  readonly turnSequence: number;
  readonly holdings: readonly Holding[];
  readonly phase: Phase;
  readonly asked: readonly AskedQuestions[];
  readonly events: readonly GameEvent[];
  // Elimination derived from holdings; no contradictory eliminated[] / winner?.
  // Quiz is consumed structurally by leaving quiz phase, not a reusable boolean.
}
export type Action =
  | {
      readonly kind: "answerQuiz";
      readonly turnSequence: number;
      readonly questionId: QuestionId;
      readonly answer: AnswerToken;
    }
  | {
      readonly kind: "skipQuiz";
      readonly turnSequence: number;
      readonly questionId: QuestionId;
    }
  | { readonly kind: "place"; readonly countyId: CountyId; readonly count: number }
  | {
      readonly kind: "attack";
      readonly from: CountyId;
      readonly to: CountyId;
      readonly dice: 1 | 2 | 3;
    }
  | { readonly kind: "occupy"; readonly count: number }
  | { readonly kind: "endAttacks" }
  | {
      readonly kind: "fortify";
      readonly from: CountyId;
      readonly to: CountyId;
      readonly count: number;
    }
  | { readonly kind: "skipFortify" }
  | { readonly kind: "acknowledgeHandoff"; readonly turnSequence: number };
export interface EngineError {
  readonly code:
    | "INVALID_INPUT"
    | "INVALID_PACK"
    | "INVALID_SAVE"
    | "WRONG_PHASE"
    | "ILLEGAL_ACTION"
    | "STALE_QUIZ"
;
  readonly message: string;
}
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: EngineError };
export type ReduceResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly error: EngineError };
export interface RngSnapshot {
  readonly algorithm: string;
  readonly seed: string;
  readonly draws: number;
}
export interface SaveEnvelope {
  readonly version: 1;
  readonly state: GameState;
  readonly rng: RngSnapshot;
}
export interface Engine {
  createGame(config: GameConfig, rng: Rng): ParseResult<GameState>;
  reduce(state: GameState, action: Action, rng: Rng): ReduceResult;
  checkInvariants(state: GameState): readonly string[];
  serialize(save: SaveEnvelope): string;
  deserialize(raw: unknown): ParseResult<SaveEnvelope>;
}
export interface PackParsers {
  parseMap(raw: unknown): ParseResult<MapPack>;
  parseQuiz(raw: unknown, map: MapPack): ParseResult<QuizPack>;
  parseConfig(raw: unknown): ParseResult<GameConfig>;
}
export interface QuizSelector {
  /** County already drawn by engine. Does not favor a different county. */
  pickQuestion(input: {
    readonly countyId: CountyId;
    readonly pack: QuizPack;
    readonly asked: readonly QuestionId[];
    readonly rng: Rng;
  }): ParseResult<QuizQuestion>;
}
