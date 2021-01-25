if (process.env.NODE_ENV === 'DEV') {
    const sourceMapSupport = require('source-map-support')
    sourceMapSupport.install()
}

export {
    CRBL,
} from './CRBL'
export {
    DB,
} from './DB'
export {
    Query,
    QueryState,
} from './Query'
export {
    Insert,
    InsertState,
} from './Insert'

// import '../example'