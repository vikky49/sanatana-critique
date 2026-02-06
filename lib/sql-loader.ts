import {readFileSync} from 'fs';
import {join} from 'path';

const queryCache = new Map<string, string>();

export function loadQuery(name: string): string {
    if (queryCache.has(name)) {
        return queryCache.get(name)!;
    }

    const queryPath = join(process.cwd(), 'sql', 'queries', `${name}.sql`);
    const content = readFileSync(queryPath, 'utf-8').trim();

    queryCache.set(name, content);
    return content;
}
