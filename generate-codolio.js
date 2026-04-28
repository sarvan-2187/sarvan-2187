const fs = require("fs");

async function generateCard() {
  try {
    const res = await fetch("https://api.codolio.com/profile?userKey=sarvan-2187");
    const json = await res.json();

    const profiles = json.data.platformProfiles.platformProfiles;

    let stats = {
      leetcode: 0,
      geeksforgeeks: 0,
      hackerrank: 0,
    };

    profiles.forEach((p) => {
      const name = p.platform.toLowerCase();

      if (name === "leetcode") {
        stats.leetcode = p.totalQuestionStats?.totalQuestionCounts || 0;
      }

      if (name === "geeksforgeeks") {
        stats.geeksforgeeks = p.totalQuestionStats?.totalQuestionCounts || 0;
      }

      if (name === "hackerrank") {
        const ps = p.categoryQuestionStats?.categoryQuestionStatList?.find(
          (s) => s.category === "Problem Solving"
        );
        stats.hackerrank = ps?.count || 0;
      }
    });

    const total =
      stats.leetcode + stats.geeksforgeeks + stats.hackerrank || 1;

    const percent = (v) => ((v / total) * 100).toFixed(1);
    const bar = (v) => (v / total) * 360; // width scaling

    const svg = `
<svg width="420" height="200" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: bold 20px sans-serif; fill: #00f5c4; }
    .label { font: 13px sans-serif; fill: #c9d1d9; }
    .value { font: bold 13px sans-serif; fill: #ffffff; }
  </style>

  <rect width="100%" height="100%" rx="14" fill="#0d1117"/>

  <text x="20" y="35" class="title">Coding Stats</text>
  <text x="300" y="35" class="value">Total: ${total}</text>

  <!-- LeetCode -->
  <text x="20" y="75" class="label">LeetCode (${percent(stats.leetcode)}%)</text>
  <rect x="20" y="85" width="360" height="10" rx="5" fill="#30363d"/>
  <rect x="20" y="85" width="${bar(stats.leetcode)}" height="10" rx="5" fill="#FFA116"/>
  <text x="380" y="75" class="value" text-anchor="end">${stats.leetcode}</text>

  <!-- GFG -->
  <text x="20" y="120" class="label">GFG (${percent(stats.geeksforgeeks)}%)</text>
  <rect x="20" y="130" width="360" height="10" rx="5" fill="#30363d"/>
  <rect x="20" y="130" width="${bar(stats.geeksforgeeks)}" height="10" rx="5" fill="#2F8D46"/>
  <text x="380" y="120" class="value" text-anchor="end">${stats.geeksforgeeks}</text>

  <!-- HackerRank -->
  <text x="20" y="165" class="label">HackerRank (${percent(stats.hackerrank)}%)</text>
  <rect x="20" y="175" width="360" height="10" rx="5" fill="#30363d"/>
  <rect x="20" y="175" width="${bar(stats.hackerrank)}" height="10" rx="5" fill="#2EC866"/>
  <text x="380" y="165" class="value" text-anchor="end">${stats.hackerrank}</text>

</svg>
`;

    fs.writeFileSync("codolio.svg", svg);
    console.log("🔥 Modern SVG generated!");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

generateCard();
