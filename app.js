const express = require("express");
const path = require("node:path");
const learnersByWeek = require("./data/learners.json");

const app = express();
const port = Number(process.env.PORT) || 3000;

const cutoffs = {
  "2": 14,
  "4": 28,
  "8": 56
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Read the selected week from the URL, such as /?week=4.
app.use((req, res, next) => {
  const requestedWeek = req.query.week;
  const week = ["2", "4", "8"].includes(requestedWeek)
    ? requestedWeek
    : "2";

  res.locals.week = week;
  res.locals.cutoffDay = cutoffs[week];
  next();
});

function getCohortAnalytics(learners) {
  const flaggedCount = learners.filter(learner => learner.risk === 1).length;
  const totalClicks = learners.reduce((total, learner) => total + learner.clicks, 0);
  const activityBands = [
    { label: "No clicks", matches: learner => learner.clicks === 0 },
    { label: "1–49 clicks", matches: learner => learner.clicks > 0 && learner.clicks < 50 },
    { label: "50–199 clicks", matches: learner => learner.clicks >= 50 && learner.clicks < 200 },
    { label: "200+ clicks", matches: learner => learner.clicks >= 200 }
  ].map(band => ({
    label: band.label,
    count: learners.filter(band.matches).length
  }));

  return {
    total: learners.length,
    flaggedCount,
    flaggedRate: learners.length ? (flaggedCount / learners.length) * 100 : 0,
    averageClicks: learners.length ? totalClicks / learners.length : 0,
    activityBands,
    maxActivityCount: Math.max(1, ...activityBands.map(band => band.count))
  };
}

// Each connected demo session gets its own copy, leaving the sample data unchanged.
app.get("/api/demo/stream", (req, res) => {
  const week = req.query.week;
  if (!["2", "4", "8"].includes(week)) {
    return res.status(400).send("Invalid demo week.");
  }

  const learners = learnersByWeek[week].map(learner => ({ ...learner }));
  res.set({
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const sendUpdate = () => {
    const learnersWithoutClicks = learners.filter(record => record.risk === 1);
    const learnerPool = learnersWithoutClicks.length ? learnersWithoutClicks : learners;
    const learner = learnerPool[Math.floor(Math.random() * learnerPool.length)];
    const clicksAdded = Math.floor(Math.random() * 4) + 1;
    learner.clicks += clicksAdded;
    learner.risk = 0;
    const updatedAt = new Date().toISOString();

    res.write(`data: ${JSON.stringify({
      learner,
      analytics: getCohortAnalytics(learners),
      clickEvent: {
        learnerId: learner.id,
        clicksAdded,
        totalClicks: learner.clicks,
        occurredAt: updatedAt
      },
      updatedAt
    })}\n\n`);
  };

  sendUpdate();
  const interval = setInterval(sendUpdate, 2500);
  req.on("close", () => clearInterval(interval));
});

// Show the cohort overview.
app.get("/", (req, res) => {
  const week = res.locals.week;
  const learners = [...learnersByWeek[week]].sort(
    (first, second) => second.risk - first.risk
      || first.clicks - second.clicks
      || String(first.id).localeCompare(String(second.id))
  );

  res.render("dashboard", {
    title: `Week ${week} Cohort Overview`,
    learners,
    analytics: getCohortAnalytics(learners),
    isDetail: false
  });
});

// Show one learner's record for the selected week.
app.get("/learners/:id", (req, res) => {
  const week = res.locals.week;
  const learner = learnersByWeek[week].find(
    record => String(record.id) === req.params.id
  );

  if (!learner) {
    return res.status(404).send("Learner record not found for this week.");
  }

  res.render("dashboard", {
    title: `Learner ${learner.id} — Week ${week}`,
    learners: [learner],
    analytics: getCohortAnalytics(learnersByWeek[week]),
    isDetail: true
  });
});

app.listen(port, () => {
  console.log(`Dashboard running at http://localhost:${port}`);
});