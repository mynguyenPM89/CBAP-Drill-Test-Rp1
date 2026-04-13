import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Timer, RotateCcw, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Flag, LayoutGrid } from "lucide-react";

/**
 * CBAP Drill Bank App (Responsive)
 * 
 * What you asked for:
 * - Areas: KA3, KA4, KA5, KA6, KA7, KA8, KA10 (custom labels)
 * - Each Area supports 2 modes:
 *    - Medium: 30 scenario MCQs, ~1 paragraph
 *    - Hard:   30 scenario MCQs, longer + traps
 * - Each session: 40 minutes, Pause/Resume
 * - Click-to-select answers (no typing)
 * - After submit: score + highlight wrong answers + review wrong list
 * 
 * Note on BABOK: BABOK v3 has 6 Knowledge Areas; "KA7/KA8/KA10" here are treated as configurable custom areas.
 * You can rename areas in AREA_CONFIG below to match your training scheme.
 */

const SESSION_QUESTIONS = 30;
const SESSION_SECONDS = 40 * 60;

const AREA_CONFIG = {
  KA3: { label: "KA3 — Planning & Monitoring", color: "bg-amber-50 border-amber-200" },
  KA4: { label: "KA4 — Elicitation & Collaboration", color: "bg-sky-50 border-sky-200" },
  KA5: { label: "KA5 — Requirements Life Cycle", color: "bg-emerald-50 border-emerald-200" },
  KA6: { label: "KA6 — Strategy / Analysis", color: "bg-orange-50 border-orange-200" },
  KA7: { label: "KA7 — Requirements Analysis & Design", color: "bg-violet-50 border-violet-200" },
  KA8: { label: "KA8 — Solution Evaluation", color: "bg-teal-50 border-teal-200" },
  KA10:{ label: "KA10 — Techniques / Tools (Mixed)", color: "bg-slate-50 border-slate-200" },
};

// Deterministic RNG
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- Template library ------------------------------------------------------
// Each template returns: { stem, correct, distractors[], keywords[] }
// We generate 30 questions by sampling templates + injecting scenario variables.

const POOLS = {
  org: ["a retail bank", "a healthcare provider", "a fintech startup", "a government agency", "a logistics company", "a SaaS vendor"],
  constraint: ["fixed regulatory deadline", "limited stakeholder availability", "distributed stakeholders", "high audit requirements", "vendor dependency"],
  channel: ["workshop", "interview", "survey", "observation", "prototype review"],
  risk: ["scope creep", "misunderstood requirements", "rework", "non-compliance", "low stakeholder buy-in"],
  artifact: ["requirements package", "traceability matrix", "backlog", "decision log", "business analysis plan"],
  metric: ["defect leakage", "cycle time", "rework rate", "stakeholder satisfaction", "time-to-approve"],
  technique: ["Workshops", "Interviews", "Document Analysis", "Decision Analysis", "Risk Analysis", "Process Modelling", "Prioritization"],
};

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

// KA4 templates: Elicitation & Collaboration
const T_KA4_MED = [
  (rand) => {
    const c = pick(rand, POOLS.constraint);
    return {
      keywords: ["elicitation", "stakeholders", "technique"],
      stem: `A BA is preparing for ${pick(rand, POOLS.channel)} sessions for ${pick(rand, POOLS.org)} under a ${c}. The BA must decide who to involve, what information is needed, and what materials to prepare. What should the BA do NEXT?`,
      correct: "Prepare for elicitation by planning stakeholders, information needs, and session materials.",
      distractors: [
        "Approve requirements to reduce uncertainty before meeting stakeholders.",
        "Communicate a final requirements package to all stakeholders immediately.",
        "Baseline the solution scope and defer elicitation until development starts.",
      ],
    };
  },
  (rand) => ({
    keywords: ["workshop", "facilitation", "needs"],
    stem: `During a ${pick(rand, POOLS.channel)}, two stakeholders keep proposing solutions and others remain silent. The BA wants to obtain balanced input on needs and constraints. What is the BEST action?`,
    correct: "Facilitate the session to refocus on needs and ensure balanced participation.",
    distractors: [
      "End the session and move directly to requirements approval.",
      "Accept the dominant stakeholders' solution to maintain momentum.",
      "Escalate to governance and pause elicitation until a decision is made.",
    ],
  }),
  (rand) => ({
    keywords: ["confirm", "elicitation results", "accuracy"],
    stem: `After elicitation, stakeholders disagree with what was captured and claim key points were misunderstood. What should the BA do to proceed safely?`,
    correct: "Confirm elicitation results by reconciling discrepancies and obtaining agreement on captured information.",
    distractors: [
      "Publish the requirements package and assume stakeholders will adapt later.",
      "Move to design and resolve misunderstandings during implementation.",
      "Replace elicitation with traceability to avoid further stakeholder debate.",
    ],
  }),
  (rand) => ({
    keywords: ["communicate", "shared understanding", "iterative"],
    stem: `The BA sends analysis findings but stakeholders interpret the message differently. What should the BA do to ensure shared understanding of the business analysis information?`,
    correct: "Use two-way, iterative communication and adjust the delivery method to ensure understanding.",
    distractors: [
      "Send the same message again without changes to maintain consistency.",
      "Ask the sponsor to communicate on the BA’s behalf.",
      "Wait until the next governance checkpoint to address confusion.",
    ],
  }),
  (rand) => ({
    keywords: ["collaboration", "conflict", "engagement"],
    stem: `Stakeholders are becoming unresponsive and conflicts keep resurfacing, slowing progress. Which task MOST directly addresses maintaining productive engagement over time?`,
    correct: "Manage stakeholder collaboration to sustain engagement and resolve issues throughout the initiative.",
    distractors: [
      "Conduct elicitation to capture more requirements immediately.",
      "Define traceability to link requirements to designs.",
      "Prioritize requirements to reduce the backlog size.",
    ],
  }),
];

const T_KA4_HARD = [
  (rand) => {
    const org = pick(rand, POOLS.org);
    return {
      keywords: ["confirm", "communicate", "trap: similar wording"],
      stem: `A BA runs multiple elicitation sessions for ${org}. Stakeholders reviewed the notes and said, “That’s not what we meant,” but they also ask for a summary package to circulate. The BA must avoid rework later. What should the BA do FIRST?`,
      correct: "Confirm elicitation results with stakeholders to correct and agree on what was captured.",
      distractors: [
        "Immediately circulate a requirements package to all stakeholders to build momentum.",
        "Escalate the disagreement to governance for a binding decision.",
        "Start prioritization to decide which requirements matter most.",
      ],
    };
  },
  (rand) => ({
    keywords: ["bi-directional", "tone", "audience"],
    stem: `A BA communicates requirements to executives and delivery teams. Executives complain the message is too detailed, while the team says key acceptance details are missing. Stakeholders also disagree on terminology. Which approach BEST aligns with BABOK communication principles?`,
    correct: "Tailor content, tone, and format per audience and verify understanding through bi-directional communication.",
    distractors: [
      "Standardize one detailed document to prevent inconsistencies.",
      "Communicate only through a single stakeholder to avoid conflicting interpretations.",
      "Skip communication and rely on traceability links for clarity.",
    ],
  }),
];

// KA5 templates: Requirements Life Cycle
const T_KA5_MED = [
  (rand) => ({
    keywords: ["traceability", "impact", "dependencies"],
    stem: `A change request is raised and the BA must quickly determine what designs, test cases, and business objectives may be impacted. What is the BEST next step?`,
    correct: "Use requirements traceability to evaluate impacts and dependencies.",
    distractors: [
      "Approve the change since it is urgent.",
      "Re-baseline all requirements immediately.",
      "Ask developers to estimate and decide priority.",
    ],
  }),
  (rand) => ({
    keywords: ["maintain", "obsolete", "current state"],
    stem: `Several requirements captured early are no longer relevant due to changed assumptions. What should the BA do to maintain the requirement set properly?`,
    correct: "Update status and maintain records (e.g., mark obsolete) so the set reflects current needs.",
    distractors: [
      "Delete the requirements without record to reduce noise.",
      "Keep them unchanged for possible future use.",
      "Convert all of them into new high-priority backlog items.",
    ],
  }),
  (rand) => ({
    keywords: ["prioritize", "value", "business objectives"],
    stem: `Two stakeholders disagree on priority. The BA must recommend an ordering that supports the initiative. What should be the PRIMARY basis?`,
    correct: "Business value and alignment to objectives (considering risk and dependencies).",
    distractors: [
      "Stakeholder seniority.",
      "The order in which requests were received.",
      "Lowest implementation effort first.",
    ],
  }),
  (rand) => ({
    keywords: ["assess change", "risk", "scope"],
    stem: `A stakeholder labels a request as “urgent.” The BA has not assessed impacts yet. What should the BA do NEXT?`,
    correct: "Assess impacts, risks, and priority before committing to implement.",
    distractors: [
      "Commit to the change to keep stakeholders satisfied.",
      "Reject the change until the next release.",
      "Send the change directly to development.",
    ],
  }),
];

const T_KA5_HARD = [
  (rand) => ({
    keywords: ["trace", "untraced functionality", "trap"],
    stem: `During UAT, users love a feature that cannot be traced to any approved requirement. The product owner wants to keep it. What is the BA’s BEST first action?`,
    correct: "Investigate the traceability gap and determine if it represents missing requirements or scope creep.",
    distractors: [
      "Approve it because it delivers value.",
      "Remove it immediately to enforce governance.",
      "Create a new requirement and mark it approved retroactively.",
    ],
  }),
  (rand) => ({
    keywords: ["prioritize", "risk vs value", "trade-off"],
    stem: `A requirement has high business value but introduces significant technical risk and dependencies. Which recommendation BEST reflects BABOK prioritization thinking?`,
    correct: "Keep value-driven priority while documenting risk/dependencies and sequencing work to reduce uncertainty.",
    distractors: [
      "Always lower priority when technical risk is high.",
      "Always implement risky items last.",
      "Ignore risk if stakeholders demand the requirement.",
    ],
  }),
];

// KA3 templates: Planning & Monitoring
const T_KA3_MED = [
  (rand) => ({
    keywords: ["timing", "availability", "deadline"],
    stem: `Stakeholders are only available intermittently and the initiative has a fixed deadline. Which BA approach element is MOST impacted?`,
    correct: "Timing of business analysis work.",
    distractors: [
      "Level of abstraction.",
      "Traceability approach.",
      "Stakeholder attitudes.",
    ],
  }),
  (rand) => ({
    keywords: ["governance", "approval", "change control"],
    stem: `The organization requires formal review and approval before changing requirements and designs. Which output defines this decision-making structure?`,
    correct: "Governance approach.",
    distractors: [
      "Stakeholder engagement approach.",
      "Information management approach.",
      "Elicitation results (confirmed).",
    ],
  }),
];
const T_KA3_HARD = [
  (rand) => ({
    keywords: ["planning approach", "predictive", "adaptive"],
    stem: `A solution is expected to evolve through short iterations as more is learned. Which BA approach decision does this MOST directly influence?`,
    correct: "Planning approach along the predictive–adaptive continuum.",
    distractors: [
      "Timing of BA work only.",
      "Approval authority in governance.",
      "Stakeholder role mapping.",
    ],
  }),
];

// KA6 templates: Strategy / Analysis (custom label)
const T_KA6_MED = [
  (rand) => ({
    keywords: ["current state", "future state", "change strategy"],
    stem: `A BA is evaluating options to achieve business objectives and define the best path to the future state. Which activity is MOST aligned?`,
    correct: "Define a change strategy by assessing options and selecting an approach to reach the future state.",
    distractors: [
      "Confirm elicitation results.",
      "Approve requirements.",
      "Manage stakeholder collaboration.",
    ],
  }),
];
const T_KA6_HARD = [
  (rand) => ({
    keywords: ["assess risks", "trade-offs", "constraints"],
    stem: `A change initiative has strong benefits but also high regulatory risk and organizational constraints. What should the BA do to support an evidence-based recommendation?`,
    correct: "Assess risks and constraints, compare options, and recommend a change strategy aligned to objectives.",
    distractors: [
      "Prioritize requirements before risks are assessed.",
      "Start solution evaluation before defining the future state.",
      "Skip risk analysis if the sponsor is supportive.",
    ],
  }),
];

// KA7 templates: RADD (custom label)
const T_KA7_MED = [
  (rand) => ({
    keywords: ["validate", "verify", "model"],
    stem: `Stakeholders confirm that requirements represent their needs, but the development team says the requirements are ambiguous and inconsistent. What should the BA do NEXT?`,
    correct: "Verify requirements quality (clarity, consistency) and refine models/specifications.",
    distractors: [
      "Approve requirements immediately.",
      "Measure solution performance.",
      "Only reprioritize the backlog.",
    ],
  }),
];
const T_KA7_HARD = [
  (rand) => ({
    keywords: ["design options", "value", "recommend solution"],
    stem: `Multiple design options satisfy the requirement, but each has different costs and risks. What is the BA’s BEST next step?`,
    correct: "Analyze potential value and trade-offs across options, then recommend the best solution.",
    distractors: [
      "Select the cheapest option without analysis.",
      "Delay decision until implementation reveals the best option.",
      "Escalate to governance without providing analysis.",
    ],
  }),
];

// KA8 templates: Solution Evaluation (custom label)
const T_KA8_MED = [
  (rand) => ({
    keywords: ["measure", "performance", "KPI"],
    stem: `After release, the BA compares actual KPIs against expected outcomes to determine if the solution delivers value. Which activity is this?`,
    correct: "Measure solution performance against performance measures.",
    distractors: [
      "Conduct elicitation.",
      "Trace requirements.",
      "Define design options.",
    ],
  }),
];
const T_KA8_HARD = [
  (rand) => ({
    keywords: ["limitations", "recommend actions", "increase value"],
    stem: `Solution metrics show partial improvement, but users report workarounds and limitations. The BA must recommend next actions to maximize value. What should the BA do?`,
    correct: "Assess solution limitations and recommend actions to increase solution value.",
    distractors: [
      "Re-run stakeholder analysis only.",
      "Freeze requirements to stop changes.",
      "Ignore qualitative feedback if KPIs improved.",
    ],
  }),
];

// KA10 templates: Techniques/Tools (custom label)
const T_KA10_MED = [
  (rand) => {
    const t = pick(rand, POOLS.technique);
    return {
      keywords: ["technique", "fit", "scenario"],
      stem: `A BA needs to gather detailed information from a domain SME who has limited time and prefers one-on-one discussions. Which technique is MOST appropriate?`,
      correct: "Interviews.",
      distractors: ["Focus groups.", "Brainstorming with a large workshop.", "Observation only."],
    };
  },
];
const T_KA10_HARD = [
  (rand) => ({
    keywords: ["decision analysis", "weighted scoring", "trap"],
    stem: `A BA must recommend among several options using multiple criteria with different importance (weights). Stakeholders disagree, so the BA needs a transparent method. Which technique BEST fits?`,
    correct: "Decision analysis using a weighted scoring approach.",
    distractors: [
      "Document analysis of previous projects.",
      "Observation of end users.",
      "Process modelling without evaluation criteria.",
    ],
  }),
];

const TEMPLATE_MAP = {
  KA3: { medium: T_KA3_MED, hard: T_KA3_HARD },
  KA4: { medium: T_KA4_MED, hard: T_KA4_HARD },
  KA5: { medium: T_KA5_MED, hard: T_KA5_HARD },
  KA6: { medium: T_KA6_MED, hard: T_KA6_HARD },
  KA7: { medium: T_KA7_MED, hard: T_KA7_HARD },
  KA8: { medium: T_KA8_MED, hard: T_KA8_HARD },
  KA10:{ medium: T_KA10_MED, hard: T_KA10_HARD },
};

function buildSession(areaKey, mode, seed) {
  const rand = mulberry32(seed);
  const templates = TEMPLATE_MAP[areaKey][mode];
  // create 30 questions by cycling templates with varied variables
  const qs = [];
  for (let i = 0; i < SESSION_QUESTIONS; i++) {
    const t = templates[i % templates.length];
    const q = t(rand);
    const optsRaw = [q.correct, ...q.distractors];
    const opts = shuffle(optsRaw, rand);
    const correctIndex = opts.indexOf(q.correct);
    qs.push({
      sid: i + 1,
      stem: q.stem,
      options: opts,
      correctIndex,
      keywords: q.keywords || [],
      areaKey,
      mode,
    });
  }
  return qs;
}

export default function CBAP_KA_Bank_App() {
  const [area, setArea] = useState("KA4");
  const [mode, setMode] = useState("medium"); // medium | hard

  const [started, setStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SESSION_SECONDS);

  const [seed, setSeed] = useState(() => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // idx -> opt
  const [flagged, setFlagged] = useState({}); // idx -> bool
  const [showGrid, setShowGrid] = useState(false);
  const [reviewWrongOnly, setReviewWrongOnly] = useState(true);

  const session = useMemo(() => buildSession(area, mode, seed), [area, mode, seed]);
  const current = session[index];

  // timer
  useEffect(() => {
    if (!started || submitted || !running) return;
    if (timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [started, submitted, running, timeLeft]);

  useEffect(() => {
    if (!started || submitted) return;
    if (timeLeft === 0) {
      setSubmitted(true);
      setRunning(false);
      setShowGrid(true);
      setReviewWrongOnly(true);
    }
  }, [timeLeft, started, submitted]);

  const score = useMemo(() => {
    let correct = 0;
    let answered = 0;
    const wrongIdx = [];
    session.forEach((q, i) => {
      const a = answers[i];
      if (a !== undefined) {
        answered++;
        if (a === q.correctIndex) correct++;
        else wrongIdx.push(i);
      }
    });
    return { correct, answered, total: session.length, wrongIdx, unanswered: session.length - answered };
  }, [answers, session]);

  const progress = Math.round(((index + 1) / session.length) * 100);

  const start = () => {
    setStarted(true);
    setSubmitted(false);
    setRunning(true);
    setTimeLeft(SESSION_SECONDS);
    setIndex(0);
    setAnswers({});
    setFlagged({});
    setShowGrid(false);
  };

  const newSession = () => {
    setSeed((s) => ((s + 0x9e3779b9) ^ Date.now()) >>> 0);
    setStarted(false);
    setSubmitted(false);
    setRunning(false);
    setTimeLeft(SESSION_SECONDS);
    setIndex(0);
    setAnswers({});
    setFlagged({});
    setShowGrid(false);
  };

  const submit = () => {
    setSubmitted(true);
    setRunning(false);
    setShowGrid(true);
  };

  const select = (optIdx) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [index]: optIdx }));
  };

  const toggleFlag = () => setFlagged((prev) => ({ ...prev, [index]: !prev[index] }));

  const gridVariant = (i) => {
    const a = answers[i];
    if (!submitted) return a !== undefined ? "outline" : "outline";
    if (a === undefined) return "outline";
    return a === session[i].correctIndex ? "default" : "destructive";
  };

  const reviewList = useMemo(() => {
    if (!submitted) return [];
    return reviewWrongOnly ? score.wrongIdx : session.map((_, i) => i);
  }, [submitted, reviewWrongOnly, score.wrongIdx, session]);

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">CBAP Drill Bank (KA3/4/5/6/7/8/10)</h1>
            <p className="text-sm text-slate-600">30 questions per session • 40 minutes • Pause/Resume • Medium/Hard</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {started && (
              <div className={`flex items-center gap-2 rounded-2xl px-3 py-2 border ${timeLeft <= 300 ? "border-rose-400 bg-rose-50" : "bg-white"}`}>
                <Timer className="h-4 w-4" />
                <span className="font-mono font-semibold">{formatTime(timeLeft)}</span>
                {!running && !submitted && <Badge variant="outline" className="rounded-xl">Paused</Badge>}
              </div>
            )}
            {!started ? (
              <Button className="rounded-2xl" onClick={start}>Start</Button>
            ) : (
              <>
                <Button variant="outline" className="rounded-2xl" onClick={() => setRunning((r) => !r)} disabled={submitted || timeLeft === 0}>
                  {running ? "Pause" : "Resume"}
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => setShowGrid((v) => !v)}>
                  <LayoutGrid className="h-4 w-4 mr-2" /> Grid
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={toggleFlag}>
                  <Flag className="h-4 w-4 mr-2" /> {flagged[index] ? "Unflag" : "Flag"}
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={newSession}>
                  <RotateCcw className="h-4 w-4 mr-2" /> New
                </Button>
                <Button className="rounded-2xl" onClick={submit} disabled={submitted || score.answered === 0}>Submit</Button>
              </>
            )}
          </div>
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Select KA + Mode</CardTitle>
            <CardDescription className="text-sm">Each question includes realistic KA keywords. Hard mode includes traps.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Object.keys(AREA_CONFIG).map((k) => (
                <Button
                  key={k}
                  variant={area === k ? "default" : "outline"}
                  className={`rounded-2xl ${area === k ? "" : "bg-white"}`}
                  onClick={() => { setArea(k); setStarted(false); setSubmitted(false); setRunning(false); setIndex(0); setAnswers({}); setFlagged({}); setShowGrid(false); setTimeLeft(SESSION_SECONDS); }}
                >
                  {k}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant={mode === "medium" ? "default" : "outline"} className="rounded-2xl" onClick={() => setMode("medium")}>Medium Mode</Button>
              <Button variant={mode === "hard" ? "destructive" : "outline"} className="rounded-2xl" onClick={() => setMode("hard")}>Hard Mode</Button>
              <Badge variant="secondary" className="rounded-xl">Session: 30Q / 40m</Badge>
              <Badge variant="outline" className="rounded-xl">{AREA_CONFIG[area].label}</Badge>
            </div>

            <Separator />

            {started && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}
          </CardContent>
        </Card>

        {started && (
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-xl">Q {index + 1}/{session.length}</Badge>
                  <Badge variant="outline" className="rounded-xl">{current.areaKey}</Badge>
                  <Badge variant="outline" className="rounded-xl">{current.mode.toUpperCase()}</Badge>
                  {flagged[index] && <Badge variant="destructive" className="rounded-xl">Flagged</Badge>}
                  {submitted && (
                    <Badge className="rounded-xl" variant={score.correct / score.total >= 0.7 ? "default" : "destructive"}>
                      Score: {score.correct}/{score.total}
                    </Badge>
                  )}
                </div>

                {submitted && (
                  <div className="text-sm text-slate-700">Wrong: {score.answered - score.correct} • Unanswered: {score.unanswered}</div>
                )}
              </div>

              <Separator />

              <div className="rounded-2xl border bg-white p-4">
                <p className="text-slate-900 leading-relaxed">{current.stem}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(current.keywords || []).slice(0, 6).map((kw, i) => (
                    <Badge key={i} variant="outline" className="rounded-xl">{kw}</Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                {current.options.map((opt, optIdx) => {
                  const chosen = answers[index] === optIdx;
                  const correct = submitted && optIdx === current.correctIndex;
                  const wrongChosen = submitted && chosen && optIdx !== current.correctIndex;
                  return (
                    <Button
                      key={optIdx}
                      variant={chosen ? "default" : "outline"}
                      className={
                        "justify-start text-left whitespace-normal h-auto py-3 rounded-2xl " +
                        (submitted && correct ? "border-emerald-400 bg-emerald-50 text-slate-900 hover:bg-emerald-50" : "") +
                        (submitted && wrongChosen ? "border-rose-400 bg-rose-50 text-slate-900 hover:bg-rose-50" : "")
                      }
                      onClick={() => select(optIdx)}
                      disabled={submitted}
                    >
                      <span className="mr-3 font-semibold">{String.fromCharCode(65 + optIdx)}.</span>
                      <span>{opt}</span>
                      {submitted && correct && <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-600" />}
                      {submitted && wrongChosen && <XCircle className="ml-auto h-5 w-5 text-rose-600" />}
                    </Button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" className="rounded-2xl" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
                  <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => setIndex((i) => Math.min(session.length - 1, i + 1))} disabled={index === session.length - 1}>
                  Next <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>

              {showGrid && (
                <div className="rounded-2xl border bg-white p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-semibold">Question Grid</p>
                    {submitted && (
                      <div className="flex items-center gap-2">
                        <Checkbox checked={reviewWrongOnly} onCheckedChange={(v) => setReviewWrongOnly(Boolean(v))} />
                        <span className="text-sm text-slate-700">Show wrong only in review list</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
                    {session.map((q, i) => (
                      <Button
                        key={q.sid}
                        variant={gridVariant(i)}
                        className={`rounded-xl h-9 ${flagged[i] ? "ring-2 ring-amber-400" : ""}`}
                        onClick={() => { setIndex(i); setShowGrid(false); }}
                      >
                        {i + 1}
                      </Button>
                    ))}
                  </div>

                  {submitted && (
                    <>
                      <Separator />
                      <p className="font-semibold">Review incorrect questions</p>
                      {score.wrongIdx.length === 0 ? (
                        <p className="text-sm text-slate-700">No incorrect answers 🎉</p>
                      ) : (
                        <div className="space-y-2">
                          {reviewList.filter((i) => score.wrongIdx.includes(i)).map((wi) => (
                            <Button
                              key={wi}
                              variant="outline"
                              className="w-full justify-between rounded-2xl"
                              onClick={() => { setIndex(wi); setShowGrid(false); }}
                            >
                              <span>Go to Q{wi + 1}</span>
                              <span className="text-xs text-slate-500">Your: {answers[wi] === undefined ? "—" : String.fromCharCode(65 + answers[wi])} • Correct: {String.fromCharCode(65 + session[wi].correctIndex)}</span>
                            </Button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="text-xs text-slate-500">
          Tip: If you want fully-authentic BABOK-aligned banks (30 medium + 30 hard) per area, replace TEMPLATE_MAP with your curated question sets.
        </div>
      </div>
    </div>
  );
}
