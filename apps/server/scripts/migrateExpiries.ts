import redis from "../src/redis.ts";

async function migrateExpiries() {
  console.log("Starting expiry migration...");

  const oldZset = "galleries:expiries";
  const newZset = "galleries:expiries:v2";

  try {
    // Get all members with scores from old zset
    const oldEntries = await redis.client.zRangeWithScores(oldZset, 0, -1);

    if (oldEntries.length === 0) {
      console.log("No entries to migrate");
      return;
    }

    console.log(`Migrating ${oldEntries.length} entries...`);

    // Add all entries to new zset
    const multi = redis.client.multi();
    for (const entry of oldEntries) {
      multi.zAdd(newZset, [{ score: entry.score, value: entry.value }]);
    }
    await multi.exec();

    console.log("Migration completed successfully");

    // Optional: Delete old zset after verification
    // await redis.client.del(oldZset);
    // console.log("Old zset deleted");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await redis.client.quit();
  }
}

// Run the migration
migrateExpiries().catch(console.error);
