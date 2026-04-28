const fs = require("fs");
const fetch = require("node-fetch");

async function generateCard() {
  try {
    const res = await fetch("https://api.codolio.com/profile?userKey=sarvan-2187");
    const json = await res.json();

    const profiles = json.data.platformProfiles.platformProfiles;

    let totalSolved = 0;

    profiles.forEach((p) => {
      const name = p.platform.toLowerCase();

      if (["leetcode", "geeksforgeeks", "hackerrank"].includes(name)) {
        totalSolved += p.totalQuestionStats?.totalQuestionCounts || 0;

        if (name === "hackerrank" && p.categoryQuestionStats?.categoryQuestionStatList) {
          const ps = p.categoryQuestionStats.categoryQuestionStatList.find(
            (s) => s.category === "Problem Solving"
          );
          if (ps) totalSolved = Math.max(totalSolved, ps.count);
        }
      }
    });

    const svg = `
<svg width="400" height="120" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: bold 18px sans-serif; fill: #00f5c4; }
    .text { font: 14px sans-serif; fill: #ffffff; }
  </style>
  <rect width="100%" height="100%" fill="#0d1117" rx="10"/>
  <text x="20" y="30" class="title">Codolio Stats</text>
  <text x="20" y="60" class="text">Solved: ${totalSolved}</text>
  <text x="20" y="85" class="text">Platforms: LeetCode | GFG | HackerRank</text>
</svg>
`;

    fs.writeFileSync("codolio.svg", svg);
    console.log("SVG generated!");
  } catch (err) {
    console.error(err);
  }
}

generateCard();
