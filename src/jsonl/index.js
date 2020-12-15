const fs = require('fs')
const path = require('path')
const { promisify } = require('util')


const {
    DB_DIR,
    DB,
    DB_CAPACITY,
} = require('../constants')
const {
    linesCount,
    matchGlob,
} = require('../utils')


const access = promisify(fs.access)
const mkdir = promisify(fs.mkdir)

const fileExtension = 'txt'

module.exports = {
    async connect() {
        const DBMS = getOrCreateDb(DB, DB_CAPACITY)
    }
}



async function getOrCreateDb(db, dbCapacity) {
    const dirPath = (await matchGlob(`${DB_DIR}/${db}${dbCapacity}/`))[0]

    const dbMeta = {
        dirPath: dirPath,
        capacity: dbCapacity,
        filesCount: 0,
        lastFileCapacity: undefined
    }
    if (!dirPath) {
        await mkdir(dirPath)
        return dbMeta
    }

    console.log(`Existing DB Directory ${db}${dbCapacity}!`)
    const filePaths = await matchGlob(path.join(dirPath, `*.${fileExtension}`))

    if (!filePaths.length) {
        return dbMeta
    }

    const lastFilePath = filePaths[filePaths.length]
    return {
        ...dbMeta,
        filesCount: filePaths.length,
        lastFileCapacity: linesCount(lastFilePath)
    }
}


async function run() {
    async function f() {
        return Promise.resolve(1)
    }
    console.log(await f())
    // mkdir('./aaaaaa')
    // mkdir('./aaaaaa')
}
run()