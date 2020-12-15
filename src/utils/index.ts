import fs from 'fs'
import readline from 'readline'
import { Writable } from 'stream'
import { promisify } from 'util'

import glob from 'glob'


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
        console.log('hey')
        res(linesCount)
    })
}

async function matchGlob(pattern: Parameters<typeof glob>['0'], options?: Parameters<typeof glob>['1']): Promise<string[]> {
    return new Promise((res, rej) => {
        const handler = (err: any, matches: any) => {
            if (err) return rej(err)
            res(matches)
        }
        if (options) {
            glob(pattern, options, handler)
        } else {
            glob(pattern, handler)
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
    if(items.length === 0) {
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
    delimitItems
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