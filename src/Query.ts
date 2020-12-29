import DRange from "drange";

import {
    readLinesUp,
} from './utils'
import {
    DB,
} from './DB'


/**Query Result */
interface QueryState {
    /**Queried items array */
    queryItems: {
        /**id of item,i.e. line index */
        id: number;
        /**item content - string */
        item: string;
    }[];

    /**lines count in database */
    lCount: number;
    /**files count in database */
    fCount: number;
}
class Query implements PromiseLike<QueryState> {
    protected executedPromise!: Promise<any>

    protected async exec(files: string[], linesCount: number) {
        const db = this.db
        const predicate = this.predicate
        const rangeCapacity = db.config.fileCapacity

        let range = new DRange(0, linesCount)
        if (this.segments.length) {
            range = new DRange()
            for (const segment of this.segments) {
                if (segment < 0 || segment > files.length - 1) {
                    continue
                }
                range.add(segment * rangeCapacity, segment * rangeCapacity + (rangeCapacity - 1))
            }
        }
        range.subtract(linesCount, Infinity)

        const result: QueryState = {
            queryItems: [],
            lCount: linesCount,
            fCount: files.length,
        }
        if (!range.length) {
            return result
        }

        let rangeStart = range.index(0)
        if (this.skipCount) {
            range.subtract(rangeStart, rangeStart + this.skipCount - 1)
            if (!range.length) {
                return result
            }
        }

        rangeStart = range.index(0)
        if (this.limitCount) {
            range.subtract(rangeStart + this.limitCount, Infinity)
            if (!range.length) {
                return result
            }
        }
        const queries: Promise<string[]>[] = []

        const start = range.index(0)
        const end = range.index(range.length - 1)

        const startFileIndex = Math.floor(start / rangeCapacity)
        const endFileIndex = Math.floor(end / rangeCapacity)

        let currFileIndex = startFileIndex
        let currLineIndex = start
        while (currFileIndex !== endFileIndex) {
            const query = readLinesUp(files[currFileIndex], currLineIndex % rangeCapacity)
            queries.push(query)
            currLineIndex += rangeCapacity - currLineIndex % rangeCapacity
            currFileIndex++
        }

        const query = readLinesUp(files[currFileIndex], currLineIndex % rangeCapacity, end % rangeCapacity)
        queries.push(query)

        const linesRanges = await Promise.all(queries)
        let id = start

        linesRanges.forEach(lines => {
            lines.forEach(line => {
                try {
                    if (predicate(line)) {
                        result.queryItems.push({
                            id,
                            item: line,
                        })
                    }
                } catch {

                } finally {
                    id++
                }
            })
        })

        return result
    }

    then<TResult1 = QueryState, TResult2 = never>(onfulfilled?: ((value: QueryState) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        if (!this.executedPromise) {
            const QueryPromise = new Promise(async (res, rej) => {
                // Taking Snapshot
                const files = this.db.files
                const linesCount = this.db.linesCount
                Promise.resolve()
                // ____________

                try {
                    const result = await this.exec(files, linesCount)
                    res(result)
                } catch (err) {
                    rej(err)
                }
            }).then(onfulfilled as any, onrejected)
            this.executedPromise = QueryPromise
        }
        return this.executedPromise
    }

    constructor(
        protected db: DB,

        protected segments: number[] = [],
        protected skipCount: number = 0,
        protected limitCount: number = 0,
        protected predicate: (line: string) => boolean = () => true,
        // protected segment
    ) {
        this.segments = [...this.segments]
    }

    /**
     * Sets file index in which to performe Query
     * @param segment - index of file in db store( after chronological sorting. ).
     */
    segment(segment: number): Omit<Query, 'segment' | 'segmentRange'> {
        if (segment >= 0) {
            this.segments = [segment]
            return this
        }
        this.segments = [0]
        return this
    }
    /**
     * Sets files indexes range in which to performe Query
     * @param segmentRange - files range in format [startIndex, endIndex]
     * - StartIndex default - 0
     * - endIndex default - Infinity
     * 
     * **Note: If some index is negative, 0 will be used.**
     */
    segmentRange(segmentRange: [number, number]): Omit<Query, 'segment' | 'segmentRange'> {
        if (!(segmentRange instanceof Array) || !segmentRange.length) {
            segmentRange = [0, Infinity]
        } else if (segmentRange.length as any === 1) {
            segmentRange = [segmentRange[0], Infinity]
        } else if (segmentRange.length > 2) {
            segmentRange = [segmentRange[0], segmentRange[1]]
        }

        let start = segmentRange[0] >= 0 ? segmentRange[0] : 0
        let end = segmentRange[1] >= 0 ? segmentRange[1] : 0
        if (start > end) {
            ({ start, end } = { start: end, end: start })
        }

        this.segments = []
        for (let i = 0; start + i <= end; i++) {
            this.segments.push(start + i)
        }
        return this
    }
    /**
     * Sets how many lines to skip before performing Query
     * @param count - lines count to skip
     * 
     * **Note: When used with limit, order of calls not matter, first will be performed skip,
     * thereafter limit.**
     */
    skip(count: number): Omit<Query, 'segment' | 'segmentRange'> {
        if (count >= 0) {
            this.skipCount = count
            return this
        }

        this.skipCount = 0
        return this
    }
    /**
     * Sets max count of items to Query
     * @param count - max count of items to query
     * 
     * **Note: When used with limit, order of calls not matter, first will be performed skip,
     * thereafter limit.**
     */
    limit(count: number): Omit<Query, 'segment' | 'segmentRange'> {
        if (count >= 0) {
            this.limitCount = count
            return this
        }

        this.limitCount = 0
        return this
    }
    /**
     * Defines checker function to call for each queried item,
     * to define if to include in results.
     * @param predicate - function which must retur **true** to include item,
     * or **false(or throw error)** to omit item from results
     */
    find(predicate: (line: string) => boolean): Omit<Query, 'segment' | 'segmentRange' | 'limit' | 'skip'> {
        if (typeof predicate !== 'function') {
            return this
        }

        this.predicate = predicate
        return this
    }
}

export {
    Query,
    QueryState,
}