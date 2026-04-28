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

      // ✅ Sum ALL HackerRank categories (matches Codolio = 84)
      if (name === "hackerrank") {
        const list = p.categoryQuestionStats?.categoryQuestionStatList || [];
        stats.hackerrank = list.reduce((sum, item) => sum + (item.count || 0), 0);
      }
    });

    const total =
      stats.leetcode + stats.geeksforgeeks + stats.hackerrank || 1;

    // percentages
    const lcPercent = (stats.leetcode / total) * 100;
    const gfgPercent = (stats.geeksforgeeks / total) * 100;
    const hrPercent = (stats.hackerrank / total) * 100;

    // ✅ FIXED: match background width EXACTLY
    const totalWidth = 472;

    const lcWidth = Math.round((stats.leetcode / total) * totalWidth);
    const gfgWidth = Math.round((stats.geeksforgeeks / total) * totalWidth);
    const hrWidth = totalWidth - lcWidth - gfgWidth;

    const svg = `
<svg width="520" height="200" xmlns="http://www.w3.org/2000/svg">

  <!-- Background -->
  <rect x="0" y="0" width="520" height="200" rx="16" fill="#0d1117" stroke="#30363d"/>

  <!-- Header -->
  <text x="24" y="42" fill="#ffffff" font-size="22" font-weight="700" font-family="Segoe UI, sans-serif">
    Coding Stats
  </text>

  <text x="496" y="42" text-anchor="end" fill="#c9d1d9" font-size="16" font-weight="600" font-family="Segoe UI, sans-serif">
    Total: ${total}
  </text>

  <!-- Bar Background -->
  <rect x="24" y="70" width="${totalWidth}" height="12" rx="6" fill="#30363d"/>

  <!-- Segments -->
  <rect x="24" y="70" width="${lcWidth}" height="12" rx="6" fill="#facc15"/>
  <rect x="${24 + lcWidth}" y="70" width="${gfgWidth}" height="12" fill="#3b82f6"/>
  <rect x="${24 + lcWidth + gfgWidth}" y="70" width="${hrWidth}" height="12" rx="6" fill="#22c55e"/>

  <!-- Legend -->
  <!-- LeetCode -->
  <circle cx="30" cy="115" r="6" fill="#facc15"/>
  <text x="45" y="120" fill="#c9d1d9" font-size="15" font-family="Segoe UI, sans-serif">
    LeetCode ${lcPercent.toFixed(1)}%
  </text>

  <!-- GFG -->
  <circle cx="30" cy="145" r="6" fill="#3b82f6"/>
  <text x="45" y="150" fill="#c9d1d9" font-size="15" font-family="Segoe UI, sans-serif">
    GFG ${gfgPercent.toFixed(1)}%
  </text>

  <!-- HackerRank -->
  <circle cx="270" cy="115" r="6" fill="#22c55e"/>
  <text x="285" y="120" fill="#c9d1d9" font-size="15" font-family="Segoe UI, sans-serif">
    HackerRank ${hrPercent.toFixed(1)}%
  </text>

</svg>
`;

    fs.writeFileSync("codolio.svg", svg);
    console.log("🔥 SVG generated successfully!");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

generateCard();
