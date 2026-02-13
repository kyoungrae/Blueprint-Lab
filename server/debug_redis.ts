import { redis } from './src/config/redis';

async function checkRedis() {
    const keys = await redis.keys('project:*:online');
    console.log('Online user keys found:', keys);

    for (const key of keys) {
        const data = await redis.hgetall(key);
        console.log(`\nKey: ${key}`);
        for (const [field, value] of Object.entries(data)) {
            console.log(`  Field: ${field} -> ${value}`);
        }
    }

    // Potentially cleanup everything to start fresh
    // await redis.flushall();
    // console.log('\nRedis flushed clean.');

    process.exit(0);
}

checkRedis().catch(console.error);
