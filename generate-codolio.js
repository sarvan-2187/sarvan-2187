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

    const lcPercent = (stats.leetcode / total) * 100;
const gfgPercent = (stats.geeksforgeeks / total) * 100;
const hrPercent = (stats.hackerrank / total) * 100;

// width scaling (total bar = 460px)
const lcWidth = (lcPercent / 100) * 460;
const gfgWidth = (gfgPercent / 100) * 460;
const hrWidth = (hrPercent / 100) * 460;

const svg = `
<svg width="500" height="180" xmlns="http://www.w3.org/2000/svg">

  <!-- Background -->
  <rect x="0" y="0" width="500" height="180" rx="12" fill="#0d1117" stroke="#30363d"/>

  <!-- Title -->
  <text x="20" y="35" fill="#ffffff" font-size="18" font-weight="600" font-family="Segoe UI, sans-serif">
    Coding Stats
  </text>

  <!-- Stacked Bar Background -->
  <rect x="20" y="60" width="460" height="10" rx="5" fill="#30363d"/>

  <!-- Segments -->
  <rect x="20" y="60" width="${lcWidth}" height="10" rx="5" fill="#FFA116"/>
  <rect x="${20 + lcWidth}" y="60" width="${gfgWidth}" height="10" fill="#2F8D46"/>
  <rect x="${20 + lcWidth + gfgWidth}" y="60" width="${hrWidth}" height="10" rx="5" fill="#2EC866"/>

  <!-- Legend -->
  <!-- LeetCode -->
  <circle cx="30" cy="100" r="5" fill="#FFA116"/>
  <text x="45" y="104" fill="#c9d1d9" font-size="13" font-family="Segoe UI, sans-serif">
    LeetCode ${lcPercent.toFixed(1)}%
  </text>

  <!-- GFG -->
  <circle cx="30" cy="125" r="5" fill="#2F8D46"/>
  <text x="45" y="129" fill="#c9d1d9" font-size="13" font-family="Segoe UI, sans-serif">
    GFG ${gfgPercent.toFixed(1)}%
  </text>

  <!-- HackerRank -->
  <circle cx="250" cy="100" r="5" fill="#2EC866"/>
  <text x="265" y="104" fill="#c9d1d9" font-size="13" font-family="Segoe UI, sans-serif">
    HackerRank ${hrPercent.toFixed(1)}%
  </text>

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
