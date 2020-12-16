import fs from 'fs'
import readline from 'readline'
import { Writable } from 'stream'
import { promisify } from 'util'

const statAsync = promisify(fs.stat)


async function sleep(time = 1000): Promise<void> {
    return new Promise((res) => {
        setTimeout(res, time);
    });
}

async function linesCount(filePath: string): Promise<number> {
    return new Promise(async res => {
        let linesCount = 0
        try {
            const readStream = fs.createReadStream(filePath)
            readStream.on('error', () => {
                res(linesCount)
            })

            const rl = readline.createInterface({
                input: readStream,
                output: new Writable(),
                crlfDelay: Infinity
            })
            for await (const line of rl) {
                linesCount++
            }
        } catch { }
        res(linesCount)
    })
}

/**
 * If End is less than start it will be set to start.
 * step **MUST** be positive.
 */
async function readLinesUp(path: string, start?: number, end?: number, step?: number): Promise<string[]> {
    return new Promise(async (res, rej) => {
        try {
            start = start ?? 0
            start = start < 0 ? 0 : start
            
            end = end ?? Infinity
            end = end < start ? start : end

            step = step ?? 1
            step = step < 1 ? 1 : step

            const lines = []

            const readStream = fs.createReadStream(path)
            readStream.on('error', (err) => rej(err))
            const rl = readline.createInterface({
                input: readStream,
                output: new Writable(),
                crlfDelay: Infinity
            })

            let lineIndex = 0
            for await (const line of rl) {
                if (start > end) break

                if (lineIndex < start) {
                    lineIndex++
                    continue
                }
                lines.push(line)

                lineIndex++
                start += step
            }

            return res(lines)
        } catch (err) {
            return rej(err)
        }
    })
}

async function chronologicalSort(filePaths: string[], order: number) {
    order = order === 0 ? 1 : order

    const stats = await Promise.all(filePaths
        .map(filePath => statAsync(filePath)
            .then(stat => ({ filePath, stat }))
        )
    )
    return stats.sort((a, b) =>
        order * (b.stat.mtime.getTime() - a.stat.mtime.getTime())
    ).map(stat => stat.filePath)
}

function delimitItems<T>(items: T[], size: number) {
    size = size <= 0 ? 1 : size
    if (items.length === 0) {
        return []
    }

    return items.reduce((delimited: T[][], item) => {
        let subItems = delimited[delimited.length - 1]

        if (subItems.length === size) {
            delimited.push([])
            subItems = delimited[delimited.length - 1]
        }
        subItems.push(item)
        return delimited
    }, [[]])
}


export {
    sleep,
    linesCount,
    matchGlob,
    chronologicalSort,
    delimitItems,
    readLinesUp,
}

// const appendFile = promisify(fs.appendFile)
// const mkdir = promisify(fs.mkdir)
// const writeFile = promisify(fs.writeFile)
// const readdir = promisify(fs.readdir)

// async function run() {

//     console.log(
//         'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
//         await readdir('./dist')
//     )
//     Promise.reject(111)
//         .then(v => console.log('v'))
//         .catch(c => console.log(c))
//         .then(l => console.log('aaaaaa'))
// }

// run()