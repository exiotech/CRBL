const path = require('path')

const {
    CRBL,
    DB,
} = require('../dist')


const databases = {
    db1: path.join(__dirname, './databases/db1'),
    db2: path.join(__dirname, './databases/db2'),
}

async function testMe() {
    console.log('Test Me Running!')

    const db = await CRBL.connect(databases.db1)
    await logDbState(db)
    
    // Asynchronous calls with op.then()
    db.insert().one('1').then(val => console.log('1'))
    db.insert().many(['2', '3']).then(val => console.log('2, 3'))
    db.insert('4').then(val => console.log('4'))
    db.insert().one('Middle Man:)').then(async () => {
        console.log('Query!!!')
        console.log((await db.query([1, 2]).limit(3).skip(7)).queryItems)
        console.log('Query END!!!')
    })
    db.insert(['5', '6']).then(val => console.log('5, 6'))
    await logDbState(db)

    // Inserting Much more items
    db.insert(['7', '8', '9', '10', '11','12','13','14','15']).then(() => console.log('10 ellements added'))

}

async function logDbState(db) {
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