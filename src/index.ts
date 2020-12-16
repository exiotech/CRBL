import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'


import jsonfile from 'jsonfile'
import DRange from "drange";


import {
    chronologicalSort,
    delimitItems,
    linesCount,
    matchGlob,
    readLinesUp,
} from './utils'


const appendFile = promisify(fs.appendFile)
const mkdir = promisify(fs.mkdir)
const writeFile = promisify(fs.writeFile)
const readdir = promisify(fs.readdir)

class JsonBl {
    static dbMap: {
        [uri: string]: Promise<DB>
    } = {}

    static async connect(dbPath: string) {
        if (!this.dbMap[dbPath]) {
            const DBPromise: Promise<DB> = (async () => {
                try {
                    const dbConfigPath = path.join(dbPath, './config')
                    const dbStoragePath = path.join(dbPath, './store')

                    const config: {
                        fileCapacity: number,
                        filesExtension: string,
                    } = await jsonfile.readFile(dbConfigPath)
                    if (typeof config!.fileCapacity !== 'number' || (config + '').trim().length === 0) {
                        throw Error
                    }

                    let files: string[] = []
                    let filesCount = 0
                    try {
                        const fileNames = await readdir(dbStoragePath)
                        files = await chronologicalSort(fileNames
                            .map(fileName =>
                                path.join(dbStoragePath, `./${fileName}`)
                            ), 1)
                        filesCount = files.length
                    } catch { await mkdir(dbStoragePath) }

                    const dbLinesCount = filesCount ? (filesCount - 1) * config.fileCapacity + await linesCount(files[filesCount - 1]) : 0
                    return new DB(path.basename(dbPath), dbPath, files, dbLinesCount, config)
                } catch {
                    delete this.dbMap[dbPath]
                    throw new Error(`Unable to connect to db at path: ${dbPath}`)
                }
            })() as any
            this.dbMap[dbPath] = DBPromise
        }
        return this.dbMap[dbPath]
    }

    static async createAndConnect(dbPath: string, dbOptions: {
        fileCapacity: number,
        fileExtension?: string
    }) {
        if (!this.dbMap[dbPath]) {
            const config: {
                fileCapacity: number,
                filesExtension: string,
            } = {
                ...dbOptions,
                filesExtension: dbOptions.fileExtension === undefined ? 'txt' : dbOptions.fileExtension
            }

            const DBPromise: Promise<DB> = (async () => {
                try {

                    const configJson = JSON.stringify(config)

                    const dbConfigPath = path.join(dbPath, './config')
                    const dbStoragePath = path.join(dbPath, './store')

                    await mkdir(dbPath)
                    await mkdir(dbStoragePath)
                    await writeFile(dbConfigPath, configJson)

                    return new DB(path.basename(dbPath), dbPath, [], 0, config as any)
                } catch {
                    throw new Error(`Unable to create db at path: ${dbPath}`)
                }
            })() as any
            this.dbMap[dbPath] = DBPromise

            return this.dbMap[dbPath]
        }
        throw new Error(`Unable to create db at path: ${dbPath}`)
    }
}


class DB {
    protected insertOpsQueue: (Query | Insert)[] = []

    constructor(
        public dbName: string,
        public dbPath: string,
        public files: string[],
        public linesCount: number,
        public config: {
            fileCapacity: number,
            filesExtension: string,
        }
    ) {

    }

    insert(items: string[]): Omit<Insert, 'one' | 'many'>
    insert(): Insert
    insert(items?: string[]) {
        return new Insert(this, this.insertOpsQueue, items)

    }
    // Change this
    query(segments?: number[]): Omit<Query, 'segment' | 'segments'>
    query(): Query
    query(segments?: number[]) {
        return new Query(this, segments)
    }
}

interface InsertState {
    lInserted: number;
    fInserted: number;
    lFinalCount: number;
}
class Insert implements PromiseLike<InsertState> {
    protected executedPromise!: Promise<any>

    protected async exec(): Promise<InsertState> {
        const db = this.db
        const fileCapacity = db.config.fileCapacity

        if (!this.items.length) {
            return {
                lInserted: 0,
                fInserted: 0,
                lFinalCount: db.linesCount,
            }
        }

        const updatedFiles = [...db.files]
        const remaininglines = db.linesCount % fileCapacity

        if (!remaininglines) {
            const delimited = delimitItems(this.items, fileCapacity)
            await Promise.all(delimited
                .map((subItems, index) => {
                    const newFilePath = `./${db.files.length + index}.${db.config.filesExtension}`
                    updatedFiles.push(newFilePath)

                    return appendFile(
                        path.join(db.dbPath, newFilePath),
                        subItems.join(os.EOL),
                    )
                })
            )

            const insertedFiles = updatedFiles.length - db.files.length
            db.files = updatedFiles
            return {
                lInserted: this.items.length,
                fInserted: insertedFiles,
                lFinalCount: db.linesCount + this.items.length
            }
        } else {
            const existingLastFilePath = `./${db.files.length - 1}.${db.config.filesExtension}`
            const remainingItems: string[] = []

            let i!: number
            for (const item of this.items) {
                i = remainingItems.push(item)
                if (i === remaininglines) {
                    break
                }
            }
            await appendFile(
                path.join(db.dbPath, existingLastFilePath),
                remainingItems.join(os.EOL),
            )
            if (this.items.length <= remaininglines) {
                const insertedFiles = updatedFiles.length - db.files.length
                db.files = updatedFiles
                return {
                    lInserted: this.items.length,
                    fInserted: insertedFiles,
                    lFinalCount: db.linesCount + this.items.length
                }
            }

            const lastItems = this.items.slice(i)
            const delimited = delimitItems(lastItems, fileCapacity)
            await Promise.all(delimited
                .map((subItems, index) => {
                    const newFilePath = `./${db.files.length + index}.${db.config.filesExtension}`
                    updatedFiles.push(newFilePath)

                    return appendFile(
                        path.join(db.dbPath, newFilePath),
                        subItems.join(os.EOL),
                    )
                })
            )

            const insertedFiles = updatedFiles.length - db.files.length
            db.files = updatedFiles
            return {
                lInserted: this.items.length,
                fInserted: insertedFiles,
                lFinalCount: db.linesCount + this.items.length
            }
        }
    }

    then<TResult1 = InsertState, TResult2 = never>(onfulfilled?: ((value: InsertState) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        if (!this.executedPromise) {
            const InsertPromise = new Promise(async (res, rej) => {
                await Promise.resolve()

                const lastOps = this.insertOpsQueue[this.insertOpsQueue.length - 1]
                this.insertOpsQueue.push(this)
                if (lastOps instanceof Query) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                } else if (lastOps instanceof Insert) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                }
                const result = await this.exec()
                this.insertOpsQueue.shift()
                res(result)
            }).then(onfulfilled as any, onrejected)
            this.executedPromise = InsertPromise
        }
        return this.executedPromise
    }

    constructor(
        protected db: DB,
        protected insertOpsQueue: any[],

        protected items: string[] = []
    ) {
        this.items = [...this.items]
    }

    one(item: string): Omit<Insert, 'one' | 'many'> {
        this.items = [item]
        return this
    }
    many(items: string[]): Omit<Insert, 'one' | 'many'> {
        this.items = [...items]
        return this
    }
}

interface QueryState {
    queryItems: {
        id: number;
        item: string
    }[]

    fCount: number
    lFinalCount: number
}
class Query implements PromiseLike<QueryState> {
    protected executedPromise!: Promise<any>

    protected async exec() {
        // await appendFile()
    }

    then<TResult1 = QueryState, TResult2 = never>(onfulfilled?: ((value: QueryState) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        if (!this.executedPromise) {
            const QueryPromise = new Promise(async (res, rej) => {
                const db = this.db
                const files = db.files
                const linesCount = db.linesCount
                const rangeCapacity = db.config.fileCapacity

                let range = new DRange(0, linesCount)
                if (this.segmentsArr.length) {
                    range = new DRange()
                    for (const segment of this.segmentsArr) {
                        if (segment < 0 || segment > files.length - 1) {
                            continue
                        }
                        range.add(segment * rangeCapacity, segment * rangeCapacity + (rangeCapacity - 1))
                    }
                }
                range.subtract(linesCount, Infinity)

                const result: QueryState = {
                    queryItems: [],
                    fCount: files.length,
                    lFinalCount: linesCount,
                }
                if (!range.length) {
                    return res(result)
                }

                let rangeStart = range.index(0)
                if (this.skipCount) {
                    range.subtract(rangeStart, rangeStart + this.skipCount)
                    if (!range.length) {
                        return res(result)
                    }
                }

                rangeStart = range.index(0)
                if (this.limitCount) {
                    range.subtract(rangeStart + this.limitCount, Infinity)
                    if (!range.length) {
                        return res(result)
                    }
                }

                const queries: Promise<string[]>[] = []

                const start = range.index(0)
                const end = range.index(range.length - 1)

                const startFileIndex = start / rangeCapacity
                const endFileIndex = end / rangeCapacity

                let currFileIndex = startFileIndex
                let currLineIndex = start
                while (currFileIndex !== endFileIndex) {
                    const query = readLinesUp(db.files[currFileIndex], currLineIndex % rangeCapacity)
                    queries.push(query)
                    currLineIndex += currLineIndex - currLineIndex % rangeCapacity
                    currFileIndex++
                }

                const query = readLinesUp(db.files[startFileIndex], 0, end % rangeCapacity)
                queries.push(query)

                const linesRanges = await Promise.all(queries)
                let id = start

                linesRanges.forEach(lines => {
                    lines.forEach(line => result.queryItems.push({
                        id: id++,
                        item: line
                    }))
                })
                
                return result
            }).then(onfulfilled as any, onrejected)
            this.executedPromise = QueryPromise
        }
        return this.executedPromise
    }

    constructor(
        protected db: DB,

        protected segmentsArr: number[] = [],
        protected skipCount: number = 0,
        protected limitCount: number = 0,
        // protected segment
    ) {
        this.segmentsArr = [...this.segmentsArr]
    }

    segment(segment: number): Omit<Query, 'segment' | 'segments'> {
        this.segmentsArr = [segment]
        return this
    }
    segmentRange(segmentsRange: [number, number]): Omit<Query, 'segment' | 'segments'> {
        let start = segmentsRange[0] < 0 ? 0 : segmentsRange[0]
        let end = segmentsRange[1] < 0 ? 0 : segmentsRange[1]
        if (start > end) {
            ({ start, end } = { start: end, end: start })
        }
        this.segmentsArr = []
        for (let i = 0; start + i <= end; i++) {
            this.segmentsArr.push(start + i)
        }
        return this
    }
    skip(count: number): Omit<Query, 'segment' | 'segments'> {
        if (count < 0) {
            this.skipCount = 0
            return this
        }
        this.skipCount = count
        return this
    }
    limit(count: number): Omit<Query, 'segment' | 'segments'> {
        if (count < 0) {
            this.limitCount = 0
            return this
        }
        this.limitCount = count
        return this
    }
}









async function run() {
    // range.add(2, 3)
    // range.add(10, 11)
    // range.add(7)
    // range.add(9)
    // const range = new DRange(10, 100)
    // // console.log(range.numbers().toString());
    // console.log(range.length);
    // range.subtract(100, Infinity)
    // console.log(range.numbers())
    // console.log(range.index(0))
    // range.subtract(2,5)
    // range.subtract( 47, Infinity)
    // console.log(range.toString())
    // console.log(range.index(6))
    // const db = await JsonBl.connect('asd')
    // await db.query().segment('3').skip(10).limit(20)
    // await db.insert(['asd'])

    // const lines = await readLinesUp('/home/redsky/Documents/exio.tech/projects/jsbl/src/jsonl/db/store/1.txt', 1, 3, -1)
    // console.log(lines)




    // const count = (await matchGlob(`/aaaaaa/asssssssaaa`, { strict: true }))
    // console.log(count)
    // i
    // const o: PromiseLike<number> = {
    //     // then(f?: ((v: number) => any) | null, g?: ((v: any) => any) | null): Promise<number> { return 1 as any }
    //     then<TResult1 = number, TResult2 = never>(onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {

    //     }

    // }
    // new Promise().then
    // await o
    // console.log(
    //     await readdir('./dist')
    // )
    // Promise.reject(111)
    //     .then(v => console.log('v'))
    //     .catch(c => console.log(c))
    //     .then(l => console.log('aaaaaa'))

    // async function f() {
    //     // await Promise.resolve()
    //     console.log('f')
    // }
    // async function g() {
    //     await f()
    //     console.log('g')
    // }
    // g()
    // console.log('b')
    // const test = '[ 13-80, 1-2, 1, 3-, 9, ]'.match(/((\d+)-(\d+))|(\d+)/)
    // console.log(test)


    // var str = 'asd-0.testing';
    // var regex = /(asd-)\d(\.\w+)/;
    // str = str.replaceAll(regex, "$11$2");
    // console.log(str);
}

run()

// const access = promisify(fs.access)

// const fileExtension = 'txt'

// module.exports = {
//     async connect() {
//         const DBMS = getOrCreateDb(DB, DB_CAPACITY)
//     }
// }


// async function getDb(db: string)

// async function getOrCreateDb(db, dbCapacity) {
//     const dirPath = (await matchGlob(`${DB_DIR}/${db}${dbCapacity}/`))[0]

//     const dbMeta = {
//         dirPath: dirPath,
//         capacity: dbCapacity,
//         filesCount: 0,
//         lastFileCapacity: undefined
//     }
//     if (!dirPath) {
//         await mkdir(dirPath)
//         return dbMeta
//     }

//     console.log(`Existing DB Directory ${db}${dbCapacity}!`)
//     const filePaths = await matchGlob(path.join(dirPath, `*.${fileExtension}`))

//     if (!filePaths.length) {
//         return dbMeta
//     }

//     const lastFilePath = filePaths[filePaths.length]
//     return {
//         ...dbMeta,
//         filesCount: filePaths.length,
//         lastFileCapacity: linesCount(lastFilePath)
//     }
// }



// const filePaths = await matchGlob(path.join(dbPath, `*.${fileExtension}`))

// if (!filePaths.length) {
//     return dbMeta
// }

// const lastFilePath = filePaths[filePaths.length]
// return {
//     ...dbMeta,
//     filesCount: filePaths.length,
//     lastFileCapacity: linesCount(lastFilePath)
// }