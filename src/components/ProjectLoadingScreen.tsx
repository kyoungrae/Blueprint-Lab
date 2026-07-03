import React from 'react';
import { Loader2 } from 'lucide-react';

interface ProjectLoadingScreenProps {
    projectName?: string | null;
}

const ProjectLoadingScreen: React.FC<ProjectLoadingScreenProps> = ({ projectName }) => (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white px-10 py-8 shadow-sm max-w-sm w-full">
            <Loader2 size={36} className="text-blue-600 animate-spin" strokeWidth={2.5} />
            <div className="text-center">
                <p className="text-sm font-bold text-gray-800">프로젝트 불러오는 중</p>
                {projectName && (
                    <p className="mt-1.5 text-xs text-gray-500 truncate max-w-[240px]" title={projectName}>
                        {projectName}
                    </p>
                )}
            </div>
        </div>
    </div>
);

export default ProjectLoadingScreen;
