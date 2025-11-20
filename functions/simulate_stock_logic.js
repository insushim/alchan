
const volatility = 0.03;
const marketImpact = 0; // Neutral market
const baseGrowth = 0.001; // New base growth
const bounceBoost = 0; // Removed bounce boost

let totalChangeSum = 0;
const iterations = 10000;

for (let i = 0; i < iterations; i++) {
    const randomChange = ((Math.random() * 2 - 1.0) * volatility) + bounceBoost;
    const volumeChange = 0; // Assume no volume for this test
    const newsImpact = 0; // Assume no news

    const totalChange = randomChange + volumeChange + newsImpact + (marketImpact * 0.3) + baseGrowth;
    totalChangeSum += totalChange;
}

const averageChange = totalChangeSum / iterations;
console.log(`Average Change over ${iterations} iterations: ${averageChange.toFixed(6)}`);
console.log(`Expected Average (approx baseGrowth): ${baseGrowth}`);

if (Math.abs(averageChange - baseGrowth) < 0.0005) {
    console.log("SUCCESS: Logic is balanced.");
} else {
    console.log("FAILURE: Logic is still biased.");
}
