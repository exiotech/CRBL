// const fs = require('fs')
// const path = require('path')
// const { promisify } = require('util')


// const {
//     DB_DIR,
//     DB,
//     DB_CAPACITY,
// } = require('../constants')
// const {
//     linesCount,
//     matchGlob,
// } = require('../utils')


// const access = promisify(fs.access)
// const mkdir = promisify(fs.mkdir)

// const fileExtension = 'txt'

// module.exports = {
//     async connect() {
//         const DBMS = getOrCreateDb(DB, DB_CAPACITY)
//     }
// }



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



const DiscontinuousRange = require('discontinuous-range')
async function run() {
    var all_numbers = new DiscontinuousRange(13,80).add(10);
    console.log(all_numbers.toString().replaceAll(1))
    // console.log(all_numbers.toString().replace(/(\d\d)-(\d\d/), ))
    // const arr = JSON.parse(all_numbers.toString())
    // console.log(arr.length)

    // const test = /(\d\d)-(\d\d)/.exec('[ 13-80 ]')
    // console.log(test)


    // var bad_numbers = DiscontinuousRange(13).add(8).add(60,80).subtract(60,70);
    // var good_numbers = all_numbers.clone().subtract(bad_numbers);
    // console.log(all_numbers.toString()); //[ 1-7, 9-12, 14-59, 81-100 ]
    // var random_good_number = good_numbers.index(Math.floor(Math.random() * good_numbers.length));


    async function f() {
        return Promise.resolve(1)
    }
    console.log(await f())
    // mkdir('./aaaaaa')
    // mkdir('./aaaaaa')
}
run()