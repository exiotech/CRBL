import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'


import {
    delimitItems,
} from './utils'
import {
    DB,
} from './DB'


const appendFile = promisify(fs.appendFile)


interface InsertState {
    lInserted: number;
    fInserted: number;
    lCount: number;
    fCount: number;
}
class Insert implements PromiseLike<InsertState> {
    protected executedPromise!: Promise<any>

    protected async exec(): Promise<InsertState> {
        const db = this.db
        const fileCapacity = db.config.fileCapacity
        const storagePath = db['storagPath']

        if (!this.items.length) {
            return {
                lInserted: 0,
                fInserted: 0,
                lCount: db.linesCount,
                fCount: db.files.length,
            }
        }

        const updatedFiles = [...db.files]
        const remaininglines = fileCapacity - db.linesCount % fileCapacity


        let i = 0
        if (remaininglines !== fileCapacity) {
            const existingLastFilePath = db.files[db.files.length - 1]
            const remainingItems: string[] = []

            for (const item of this.items) {
                i = remainingItems.push(item)
                if (i === remaininglines) {
                    break
                }
            }
            await appendFile(
                existingLastFilePath,
                os.EOL + remainingItems.join(os.EOL),
            )
            if (this.items.length <= remaininglines) {
                const insertedFiles = 0
                const insertedLinesCount = this.items.length

                db.files = updatedFiles
                db.linesCount = db.linesCount + insertedLinesCount
                return {
                    lInserted: insertedLinesCount,
                    fInserted: insertedFiles,
                    lCount: db.linesCount,
                    fCount: db.files.length,
                }
            }
        }
        
        const lastItems = this.items.slice(i)
        const delimited = delimitItems(lastItems, fileCapacity)
        await Promise.all(delimited
            .map((subItems, index) => {
                const newFilePath = path.join(storagePath, `./${db.files.length + index}.${db.config.fileExtension}`)
                updatedFiles.push(newFilePath)

                return appendFile(
                    newFilePath,
                    subItems.join(os.EOL),
                )
            })
        )

        const insertedFiles = updatedFiles.length - db.files.length
        const insertedLinesCount = this.items.length

        db.files = updatedFiles
        db.linesCount = db.linesCount + insertedLinesCount
        return {
            lInserted: insertedLinesCount,
            fInserted: insertedFiles,
            lCount: db.linesCount,
            fCount: db.files.length,
        }
    }

    then<TResult1 = InsertState, TResult2 = never>(onfulfilled?: ((value: InsertState) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        if (!this.executedPromise) {
            const InsertPromise = new Promise(async (res, rej) => {
                await Promise.resolve()

                const lastOps = this.insertOpsQueue[this.insertOpsQueue.length - 1]
                this.insertOpsQueue.push(this)
                if (lastOps) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                }

                try {
                    const result = await this.exec()
                    res(result)
                } catch (err) {
                    rej(err)
                } finally {
                    this.insertOpsQueue.shift()
                }
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

export {
    Insert,
    InsertState,
}