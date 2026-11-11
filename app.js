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