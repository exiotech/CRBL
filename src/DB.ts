import path from 'path'


import {
    Query,
} from './Query'
import {
    Insert,
} from './Insert'


class DB {
    protected insertOpsQueue: Insert[] = []
    protected storagPath: string
    protected configPath: string

    constructor(
        public dbName: string,
        public dbPath: string,
        public files: string[],
        public linesCount: number,
        public config: {
            fileCapacity: number,
            fileExtension: string,
        }
    ) {
        this.storagPath = path.join(dbPath, './store')
        this.configPath = path.join(dbPath, './config.json')
    }

    insert(items: string[]): Omit<Insert, 'one' | 'many'>
    insert(item: string): Omit<Insert, 'one' | 'many'>
    insert(): Insert
    insert(items?: string | string[]) {
        return items instanceof Array
            ? new Insert(this, this.insertOpsQueue).many(items)
            : typeof items === 'string'
                ? new Insert(this, this.insertOpsQueue).one(items)
                : new Insert(this, this.insertOpsQueue)

    }
    // Change this
    query(segmentRange: [number, number]): Omit<Query, 'segment' | 'segmentRange'>
    query(segment: number): Omit<Query, 'segment' | 'segmentRange'>
    query(): Query
    query(segment?: number | [number, number]) {
        return segment instanceof Array
            ? new Query(this).segmentRange(segment)
            : typeof segment === 'number'
                ? new Query(this).segment(segment)
                : new Query(this)
    }
}

export {
    DB,
}