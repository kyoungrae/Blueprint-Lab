/**
 * 실제 엑셀 파일 구조에 기반한 관계 검증 함수
 */

export interface ExcelRelationship {
    순번: number;
    소스테이블: string;
    소스컬럼: string;
    타겟테이블: string;
    타겟컬럼: string;
    관계: string;
}

export interface ValidationResult {
    valid: ExcelRelationship[];
    invalid: {
        row: number;
        data: ExcelRelationship;
        reason: string;
    }[];
    summary: {
        total: number;
        validCount: number;
        invalidCount: number;
        selfReferencing: number;
        duplicateRelationships: number;
        invalidTypes: number;
        missingColumns: number;
    };
    recommendations: string[];
}

/**
 * 실제 엑셀 데이터 구조 기반 검증
 */
export function validateExcelRelationshipStructure(excelData: any[]): ValidationResult {
    const valid: ExcelRelationship[] = [];
    const invalid: { row: number; data: ExcelRelationship; reason: string }[] = [];
    const summary = {
        total: excelData.length,
        validCount: 0,
        invalidCount: 0,
        selfReferencing: 0,
        duplicateRelationships: 0,
        invalidTypes: 0,
        missingColumns: 0
    };
    const recommendations: string[] = [];
    
    // 중복 관계 추적
    const relationshipKeys = new Set<string>();
    
    excelData.forEach((row, index) => {
        const rowNum = index + 1;
        
        // 데이터 구조 변환
        const relationship: ExcelRelationship = {
            순번: row['순번'] || row[0] || rowNum,
            소스테이블: row['소스테이블'] || row[1] || '',
            소스컬럼: row['소스컬럼'] || row[2] || '',
            타겟테이블: row['타겟테이블'] || row[3] || '',
            타겟컬럼: row['타겟컬럼'] || row[4] || '',
            관계: row['관계'] || row[5] || ''
        };
        
        // 1. 필수 컬럼 검증
        if (!relationship.소스테이블 || !relationship.타겟테이블) {
            invalid.push({
                row: rowNum,
                data: relationship,
                reason: '소스테이블 또는 타겟테이블이 누락됨'
            });
            summary.missingColumns++;
            summary.invalidCount++;
            return;
        }
        
        // 2. 자기 참조 검증
        if (relationship.소스테이블 === relationship.타겟테이블) {
            invalid.push({
                row: rowNum,
                data: relationship,
                reason: '자기 자신을 참조하는 관계 (Self-referencing)'
            });
            summary.selfReferencing++;
            summary.invalidCount++;
            return;
        }
        
        // 3. 관계 타입 검증
        const validTypes = ['1:1', '1:N', 'N:M', '1:n', 'n:m'];
        if (!validTypes.includes(relationship.관계)) {
            invalid.push({
                row: rowNum,
                data: relationship,
                reason: `잘못된 관계 타입: ${relationship.관계}. 허용된 타입: ${validTypes.join(', ')}`
            });
            summary.invalidTypes++;
            summary.invalidCount++;
            return;
        }
        
        // 4. 중복 관계 검증
        const relationshipKey = `${relationship.소스테이블}-${relationship.타겟테이블}-${relationship.소스컬럼}-${relationship.타겟컬럼}`;
        if (relationshipKeys.has(relationshipKey)) {
            invalid.push({
                row: rowNum,
                data: relationship,
                reason: '중복된 관계 정의'
            });
            summary.duplicateRelationships++;
            summary.invalidCount++;
            return;
        }
        relationshipKeys.add(relationshipKey);
        
        // 5. 컬럼명 규칙 검증
        const columnPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        if (relationship.소스컬럼 && !columnPattern.test(relationship.소스컬럼)) {
            invalid.push({
                row: rowNum,
                data: relationship,
                reason: `잘못된 소스컬럼 형식: ${relationship.소스컬럼}`
            });
            summary.invalidCount++;
            return;
        }
        
        if (relationship.타겟컬럼 && !columnPattern.test(relationship.타겟컬럼)) {
            invalid.push({
                row: rowNum,
                data: relationship,
                reason: `잘못된 타겟컬럼 형식: ${relationship.타겟컬럼}`
            });
            summary.invalidCount++;
            return;
        }
        
        // 유효한 관계
        valid.push(relationship);
        summary.validCount++;
    });
    
    // 추천사항 생성
    if (summary.selfReferencing > 0) {
        recommendations.push(`${summary.selfReferencing}개의 자기 참조 관계를 제거하세요.`);
    }
    
    if (summary.duplicateRelationships > 0) {
        recommendations.push(`${summary.duplicateRelationships}개의 중복 관계를 통합하세요.`);
    }
    
    if (summary.invalidTypes > 0) {
        recommendations.push('관계 타입을 1:1, 1:N, N:M 중 하나로 표준화하세요.');
    }
    
    if (summary.missingColumns > 0) {
        recommendations.push('모든 행에 소스테이블과 타겟테이블을 지정하세요.');
    }
    
    if (summary.validCount > 0) {
        recommendations.push(`${summary.validCount}개의 유효한 관계가 정상적으로 정의되었습니다.`);
    }
    
    return { valid, invalid, summary, recommendations };
}

/**
 * ERD 시스템과 엑셀 데이터 비교 검증
 */
export function compareExcelWithERD(
    excelData: ExcelRelationship[],
    erdRelationships: any[],
    erdEntities: any[]
): {
    matches: { excel: ExcelRelationship; erd: any }[];
    excelOnly: ExcelRelationship[];
    erdOnly: any[];
    inconsistencies: { excel: ExcelRelationship; erd: any; reason: string }[];
} {
    const matches: { excel: ExcelRelationship; erd: any }[] = [];
    const excelOnly: ExcelRelationship[] = [];
    const erdOnly: any[] = [];
    const inconsistencies: { excel: ExcelRelationship; erd: any; reason: string }[] = [];
    
    // ERD 엔티티 맵
    const entityMap = new Map(erdEntities.map((e: any) => [e.name || e.id, e]));
    
    // ERD 관계 맵
    const erdRelationMap = new Map(
        erdRelationships.map((r: any) => {
            const sourceEntity = entityMap.get(r.source);
            const targetEntity = entityMap.get(r.target);
            return [`${sourceEntity?.name}-${targetEntity?.name}`, r];
        })
    );
    
    // 엑셀 데이터와 ERD 데이터 비교
    excelData.forEach(excelRel => {
        const sourceEntity = erdEntities.find((e: any) => 
            e.name === excelRel.소스테이블 || e.id === excelRel.소스테이블
        );
        const targetEntity = erdEntities.find((e: any) => 
            e.name === excelRel.타겟테이블 || e.id === excelRel.타겟테이블
        );
        
        if (!sourceEntity || !targetEntity) {
            excelOnly.push(excelRel);
            return;
        }
        
        const erdKey = `${excelRel.소스테이블}-${excelRel.타겟테이블}`;
        const erdRel = erdRelationMap.get(erdKey);
        
        if (!erdRel) {
            excelOnly.push(excelRel);
            return;
        }
        
        // 관계 타입 비교
        const excelType = excelRel.관계.toUpperCase();
        const erdType = erdRel.type?.toUpperCase();
        
        if (excelType !== erdType) {
            inconsistencies.push({
                excel: excelRel,
                erd: erdRel,
                reason: `관계 타입 불일치: Excel(${excelType}) vs ERD(${erdType})`
            });
            return;
        }
        
        matches.push({ excel: excelRel, erd: erdRel });
    });
    
    // ERD에만 있는 관계 찾기
    erdRelationships.forEach((erdRel: any) => {
        const sourceEntity = entityMap.get(erdRel.source);
        const targetEntity = entityMap.get(erdRel.target);
        
        if (!sourceEntity || !targetEntity) return;
        
        const hasMatch = excelData.some(excelRel => 
            excelRel.소스테이블 === sourceEntity.name && 
            excelRel.타겟테이블 === targetEntity.name
        );
        
        if (!hasMatch) {
            erdOnly.push(erdRel);
        }
    });
    
    return { matches, excelOnly, erdOnly, inconsistencies };
}

/**
 * 상세 검증 리포트 생성
 */
export function generateValidationReport(result: ValidationResult): string {
    const report = [];
    
    report.push('=== 엑셀 관계 데이터 검증 리포트 ===');
    report.push('');
    
    report.push('## 요약');
    report.push(`- 전체 관계: ${result.summary.total}개`);
    report.push(`- 유효한 관계: ${result.summary.validCount}개`);
    report.push(`- 무효한 관계: ${result.summary.invalidCount}개`);
    report.push(`- 자기 참조: ${result.summary.selfReferencing}개`);
    report.push(`- 중복 관계: ${result.summary.duplicateRelationships}개`);
    report.push(`- 잘못된 타입: ${result.summary.invalidTypes}개`);
    report.push(`- 누락된 컬럼: ${result.summary.missingColumns}개`);
    report.push('');
    
    if (result.invalid.length > 0) {
        report.push('## 무효한 관계 목록');
        result.invalid.forEach(({ row, data, reason }) => {
            report.push(`${row}행: ${data.소스테이블}.${data.소스컬럼} -> ${data.타겟테이블}.${data.타겟컬럼} (${data.관계})`);
            report.push(`  이유: ${reason}`);
        });
        report.push('');
    }
    
    if (result.recommendations.length > 0) {
        report.push('## 개선 추천사항');
        result.recommendations.forEach(rec => {
            report.push(`- ${rec}`);
        });
        report.push('');
    }
    
    if (result.valid.length > 0) {
        report.push('## 유효한 관계 목록 (상위 10개)');
        result.valid.slice(0, 10).forEach(rel => {
            report.push(`${rel.순번}. ${rel.소스테이블}.${rel.소스컬럼} -> ${rel.타겟테이블}.${rel.타겟컬럼} (${rel.관계})`);
        });
        
        if (result.valid.length > 10) {
            report.push(`... 외 ${result.valid.length - 10}개`);
        }
    }
    
    report.push('');
    report.push('=====================================');
    
    return report.join('\n');
}
