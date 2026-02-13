import mongoose from 'mongoose';
import { Project } from './src/models/Project';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/erd-system';

async function checkProject() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');

    const project = await Project.findById('69899ecc44a7da3a2a77c7ca');
    if (!project) {
        console.log('Project not found');
    } else {
        console.log(`Project: ${project.name}`);
        const snapshot = project.currentSnapshot;
        console.log(`Entities: ${snapshot.entities.length}`);
        console.log(`Relationships: ${snapshot.relationships.length}`);

        // Check for orphan relationships
        const entityIds = new Set(snapshot.entities.map((e: any) => e.id));
        const orphans = snapshot.relationships.filter((r: any) => !entityIds.has(r.source) || !entityIds.has(r.target));

        console.log(`Orphan relationships found: ${orphans.length}`);
        if (orphans.length > 0) {
            console.log('Orphans:', JSON.stringify(orphans, null, 2));

            // Fix it!
            console.log('Cleaning up orphans in MongoDB...');
            const cleanedRelationships = snapshot.relationships.filter((r: any) => entityIds.has(r.source) && entityIds.has(r.target));
            project.currentSnapshot.relationships = cleanedRelationships;
            await project.save();
            console.log('✅ MongoDB cleaned and saved.');
        }
    }

    process.exit(0);
}

checkProject().catch(console.error);
