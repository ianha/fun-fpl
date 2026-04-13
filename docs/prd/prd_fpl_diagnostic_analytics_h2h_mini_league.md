# Product Requirements Document (PRD): FPL Diagnostic Analytics (Part 1)

## 1. Objective

To provide Fantasy Premier League (FPL) managers with deep diagnostic insights into _why_ and _how_ they are trailing or leading a specific mini-league rival. By moving beyond basic point totals, this feature set will dissect performance metrics to quantify the exact sources of points deltas, allowing users to understand if their ranking is driven by skill, luck, or specific strategic differences.

## 2. Core Features & Specifications

### Feature 1: The Points Attribution Breakdown

- **Description:** A dashboard that dissects the points delta between the user and their mini-league rival into specific strategic categories.
- **Requirements:**
  - **Captaincy Delta:** Captaincy is the single biggest driver of rank movement in FPL [1]. This metric will show the exact percentage of the point difference caused by captaincy choices between the two managers.
  - **Transfer Efficiency & Hits:** FPL rules deduct 4 points for every additional transfer made beyond the free allocation, which heavily punishes short-term managers who succumb to "fear of missing out" (FOMO) [2]. Elite FPL managers average only 0.1 to 0.3 points in transfer hits per week [3, 4]. This feature will track and compare the points gained from transfers versus the points lost to deduction hits to expose if a rival's aggressive transfer strategy is paying off or hurting them [2].
  - **Bench Impact:** Track the points gained from automatic substitutions off the bench compared to the rival's benched points to highlight squad depth efficiency.

### Feature 2: Positional Audit & "Value per Million" Comparison

- **Description:** A team audit that analyzes where a user's squad is under-indexing compared to their rival [5]. It compares how each manager's budget is distributed and performing across the pitch.
- **Requirements:**
  - **Positional Output Tracking:** Visually break down points gained from Goalkeepers, Defenders, Midfielders, and Forwards.
  - **Value Efficiency:** Data shows that the greatest value per million spent in FPL comes from Attacking Defenders and Midfielders, while Forwards offer the lowest relative value per million [6]. This feature will highlight if a rival is dominating because they have a more mathematically efficient squad structure—for example, if they have heavily invested in premium midfielders over premium forwards [6-8].

### Feature 3: The "Luck vs. Skill" Index (Expected vs. Actual Points)

- **Description:** A metric to determine if a rival manager's lead is sustainable or driven by short-term variance (luck) [9, 10].
- **Requirements:**
  - **xP vs. Actual Points Calculation:** The feature will calculate Expected Points (xP)—which utilizes underlying Expected Goals (xG), Expected Assists (xA), and clean sheet probabilities—and compare it to the rival's actual FPL points [10, 11].
  - **Variance Analysis:** Relying purely on historical points is statistically risky, as past points have a weak correlation ($R^2$ = 0.1552) with future points [12]. By using xPoints, the predictive correlation improves significantly to $R^2$ = 0.25, explaining 67% more of future point variance [10, 11]. If a rival is vastly overperforming their xP, the app will flag that they are "running hot" and relying on statistical variance rather than sustainable underlying performance [9, 10].

### Feature 4: Head-to-Head Overlap Graphic & Manager History

- **Description:** A simple visual comparison of the user's squad versus their rival's squad.
- **Requirements:**
  - **Overlap Percentage:** A graphic showing the exact percentage of overlap between the two teams [13].
  - **Differential Highlighting:** The tool will explicitly highlight the differential players (e.g., your Saka vs. their Semenyo) so a user chasing a lead knows exactly where their team varies and where they need to make up ground [13].
  - **Historical GM Rank:** A feature to track a "GM rank" over time, allowing the user to see who has been the better manager over several years of historical FPL data [14].

## 3. Data & API Requirements

- **FPL API:** For real-time team selections, budget values, transfer hits taken, and historical points [15].
- **Understat/Match Event Data:** For granular expected metrics (xG, xA, xP) to power the "Luck vs. Skill" index [10, 15].

---

### Expanded Text Footnotes

_The following expanded data points provide the raw context and statistical backing for all 15 references cited in the PRD requirements above._

**[1] Captaincy Impact**

- **Source Text:** "Captaincy remains the single biggest driver of rank movement in FPL, and Gameweek 21 once again shows near-universal agreement among experienced managers." _(Fantasy Football Fix)_

**[2] Transfer Efficiency and the Trap of "FOMO"**

- **Source Text:** "The management of transfers and the decision to take 'hits' (a -4 point deduction for additional transfers) is a defining characteristic of elite managerial play... A transfer hit is only statistically justifiable when it enables a move to a 'long-term hold' during a favorable fixture swing or a Double Gameweek, where the expected point gain... exceeds the initial 4-point cost." _(A Quantitative Framework for Rank Optimization)_

**[3] Elite Manager Transfer Hits (Frequency)**

- **Source Text:** "Data from the 'Elite 1000' managers suggests a highly conservative approach to hits, with an average of just 0.1 to 0.3 points hit per week." _(A Quantitative Framework for Rank Optimization)_

**[4] Conservative Approach to Deduction Hits**

- **Source Text:** Emphasizing the metrics behind elite performance, taking excessive hits (-4 points) heavily punishes managers. Elite managers avoid aggressive short-term transfer strategies, making the tracking of points gained via transfers vs. points lost via hits a crucial metric. _(A Quantitative Framework for Rank Optimization)_

**[5] Positional Audits and Under-Indexing**

- **Source Text:** "Perhaps some analysis on where I am under index ing … eg your D is below the mean but mid is + 10... So where to focus your fix... like a team audit." _(User Chat History / Needs Discovery)_

**[6] Positional Value per Million (Attacking Defenders and Midfielders)**

- **Source Text:** "The greatest increase in Expected Adjusted Points per £1.0m spent is found in Attacking Defenders (1.10x) and Midfielders (0.94x). Premium players in these positions offer the most predictable and guaranteed returns for the investment. Forwards offer the shallowest gradient (0.24x), meaning the increase in points from a budget forward to a premium forward is relatively low per million spent." _(Mathematically Safe: FPL Analysis)_

**[7] Midfield Premium Options & Squad Efficiency**

- **Source Text:** "Midfield Premium options are as close as we get in FPL to guaranteed EA [Expected Adjusted] points per £m spent. The $R^2$ values from the regression analysis... are the strongest of all the positions... indicating that the more you spend, the higher the returns." _(Mathematically Safe: FPL Analysis)_

**[8] Low Relative Value of Forwards**

- **Source Text:** "The Forwards offer the shallowest gradient in the baseline analysis, indicating that the increase in points from Budget to Premium is low per £m spent." _(Mathematically Safe: FPL Analysis)_

**[9] Luck vs. Skill & Stochastic Variance**

- **Source Text:** "Traditional metrics like total points or actual goals are frequently compromised by high stochastic variance and small sample sizes. Transitioning to a 'process-based' evaluation using expected data provides a much more accurate forecast..." _(A Quantitative Framework for Rank Optimization)_

**[10] Calculating xPoints**

- **Source Text:** "FPL points come from appearances, goals, assists, clean sheets, defensive returns, and so on. But instead of using the actual goals and assists, we can use expected stats (xG, xA, xCS) to calculate each player's xPoints." _(Reddit: Past points correlation with future points)_

**[11] xPoints Predictive Correlation vs. Past Points**

- **Source Text:** "When Expected Points (xPoints)—calculated using underlying xG, Expected Assists (xA), and clean sheet probabilities—were used as the predictor, the correlation coefficient improved significantly to $R^2$ = 0.2500... This indicates that underlying data explains nearly 67% more of the future point variance than past points alone." _(A Quantitative Framework for Rank Optimization)_

**[12] Historical Points Weak Correlation**

- **Source Text:** "The correlation is $R^2$ = 0.1552, which is quite low. This means that using past points to predict future points isn't very reliable." _(Reddit: Past points correlation with future points)_

**[13] Overlap Graphics and Differentials**

- **Source Text:** "Would be cool to have a simple graphic that shows how much overlap there is - so I click on you and it says 87% meaning we are almost exact same and it shows just our differentials... You have Saka and I have Semenyo. So if I am chasing you I can think about how and where to vary." _(User Chat History)_

**[14] Historical GM Rank Tracking**

- **Source Text:** "Yahoo gives you a rank as a GM over time … so for example I could see who has been better over the years - you or Brad." _(User Chat History)_

**[15] FPL API and Understat Data Integration**

- **Source Text:** "These models typically integrate official FPL API data with advanced performance stats from sources like Understat and FBref... The FPL API provides comprehensive FPL-related data... whereas the Understat API offers advanced performance statistics at both player and team levels including expected goals (xG), expected assists (xA)..." _(OpenFPL / A Quantitative Framework for Rank Optimization)_
