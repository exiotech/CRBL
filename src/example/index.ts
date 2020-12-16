import os from 'os'

import {
    CRBL,
    DB
} from '../index'

async function testMe() {
    console.log('Test Me Running!')

    const db = await CRBL.connect('/home/redsky/Documents/exio.tech/projects/jsbl/src/example/databases/db1')
    await logDbState(db)

    const insertion = db.insert(['hey', 'there' + os.EOL])
    const result = await insertion
}

async function logDbState(db: DB | Promise<DB>) {
    db = await db
    console.log(`
    ----------------------------------------
    DB Name: ${db.dbName}
    files in store: ${db.files.length},
    lines in store: ${db.linesCount},
    ----------------------------------------
    `)
}

testMe()