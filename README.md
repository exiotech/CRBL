# CRBL
CRBL is a **line by line "database"** without **Updates** and **Deletes**, hence the name:

**C**(CREATE)**R**(READ)**BL**(By Line)

What means **line by line** - it means each item stored in database as single line of file.

## Usage
As we starting from scratch, lets create and connect to database from code:
```javascript
const { CRBL } = require('crbl')

const db = await CRBL.createAndConnect('/path/to/db', {
    fileCapacity: 10, // files in store will contain max 10 lines.
    fileExtension: 'ext' // newly created files will have extension .txt
})
```
> Note: We assume that we can use top level **await**. In node environment
you need to create **async function** to execute presented examples.

Lets continue and insert items to it and query them:
```javascript
// 4 synchronous calls of Insert Async operation will executed in same order,
// as if they were synchronous.
db.insert().one('1').then()
db.insert().many(['2','3']).then()
db.insert('4').then()

await db.insert(['5','6'])

const result = await db.query()
console.log(result)
// will be printed:
// {
//   queryItems: [
//     { id: 0, item: '1' },
//     { id: 1, item: '2' },
//     { id: 2, item: '3' },
//     { id: 3, item: '4' },
//     { id: 4, item: '5' },
//     { id: 5, item: '6' }
//   ],
//   lCount: 6,
//   fCount: 1
// }
```
Insert operations above will be executed in same order they called. This is for case when
multiple write operations performed agains single file. To avoid mixing lines, we take this solution.

In the example above, first will be performed all insertes, and when final insert operation is finish,
database will be queried for all lines.

You can also query concrete files in database store:
```javascript
await db.insert().many(['7','8','9','10','11','12','13'])

const result = await db.query().segment(0) // query first(0 based index) file in 
console.log(result)
// will be printed:
// {
//   queryItems: [
//     { id: 0, item: '1' },
//     { id: 1, item: '2' },
//     { id: 2, item: '3' },
//     { id: 3, item: '4' },
//     { id: 4, item: '5' },
//     { id: 5, item: '6' },
//     { id: 6, item: '7' },
//     { id: 7, item: '8' },
//     { id: 8, item: '9' },
//     { id: 9, item: '10' }
//   ],
//   lCount: 13,
//   fCount: 2
// }
```

Or ranges of files:
```javascript
const result = await db.query().segmentRange([0, 1]) // query first two files in database
console.log(result)
// will be printed:
// {
//   queryItems: [
//     { id: 0, item: '1' },
//     { id: 1, item: '2' },
//     { id: 2, item: '3' },
//     { id: 3, item: '4' },
//     { id: 4, item: '5' },
//     { id: 5, item: '6' },
//     { id: 6, item: '7' },
//     { id: 7, item: '8' },
//     { id: 8, item: '9' },
//     { id: 9, item: '10' },
//     { id: 10, item: '11' },
//     { id: 11, item: '12' },
//     { id: 12, item: '13' }
//   ],
//   lCount: 13,
//   fCount: 2
// }
```

You can also skip some lines and limit the result.
```javascript
const result = await db.query().skip(4).limit(7) // query 7 items after 4-th line.
console.log(result)
// will be printed:
// {
//   queryItems: [
//     { id: 4, item: '5' },
//     { id: 5, item: '6' },
//     { id: 6, item: '7' },
//     { id: 7, item: '8' },
//     { id: 8, item: '9' },
//     { id: 9, item: '10' },
//     { id: 10, item: '11' }
//   ],
//   lCount: 13,
//   fCount: 2
// }
```
> Note: Order of .skip() and .limit() calls not matter, firs will be performed **skip** operation and then **limit**.

You can also performe search operations with **find** method:
```javascript
const result = await db.query()
    .skip(4)
    .limit(7)
    .find(line => line === '5' || line === '10') // query 7 items after 4-th line.
console.log(result)
// will be printed:
// {
//   queryItems: [ { id: 4, item: '5' }, { id: 9, item: '10' } ],
//   lCount: 13,
//   fCount: 2
// }
```