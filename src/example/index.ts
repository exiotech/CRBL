import os from 'os'

import {
    CRBL,
    DB
} from '../index'

async function testMe() {
    console.log('Test Me Running!')

    const db = await CRBL.connect('/home/redsky/Documents/exio.tech/projects/jsbl/src/example/databases/db1')
    await logDbState(db)
    
    // Asynchronous calls with op.then()
    db.insert().one('1. Insert One').then(val => console.log('1'))
    db.insert().many(['2. Insert Many(First)', '2. Insert Many(Second)']).then(val => console.log('2'))
    db.insert('3. Insert Single Item').then(val => console.log('3'))
    db.insert().one('Middle Man:)').then(async () => {
        console.log('Query!!!')
        console.log((await db.query(15).limit(3).skip(1)).queryItems)
        console.log('Query END!!!')
    })
    db.insert(['4. Insert Multiple Items(First)', '4. Insert Multiple Items(Second)']).then(val => console.log('5'))
    await logDbState(db)

    // Inserting Much more items
    db.insert(['5', '6', '7', '8', '9', '10', '11','12','13','14','15']).then(() => console.log('5 ellements added'))

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