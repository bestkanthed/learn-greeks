const express = require("express")
const compression = require('compression')
const bodyParser = require('body-parser')
const dotenv = require('dotenv')
const mongoose = require('mongoose')
const fileUpload = require('express-fileupload')
const session = require('express-session')
const MongoStore = require('connect-mongo')(session)
const passport = require('passport')
const cors = require('cors')

const unhandledRejection = require("unhandled-rejection")
const logger = require('./config/logger')
const email = require('./config/email')

const schedule = require('node-schedule')
const Order = require('./models/Order')
const Application = require('./models/Application')
let rejectionEmitter = unhandledRejection({
  timeout: 20
})

let job = schedule.scheduleJob('1 1 * * *', async () => {
  let orders = await Order.read({status : 'Complete'})
  for(let order of orders) {
    if((new Date(order.travelDate)) < new Date()) {
      for( let application of order.applications ) {
        application.status = 'Past'
        let applicationUpdate = await Application.update({id : application._id, status: 'Past'})
      }
      let changeOrderStatus = await Order.update({ _id: order._id, status: 'Past'})
    }
  }
})


rejectionEmitter.on("unhandledRejection", async (error, promise) => {
  console.log('error', error)
  let emailSent = await email.to(
    'abhishek@stampmyvisa.com',
    'Error in api server',
    error
  )
  if(!emailSent) logger.error(error)
})

/**
 * Passport and database configuration.
 */
const passportConfig = require('./config/passport');
const databaseConfig = require('./config/database')

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.load({ path: '.env.example' })

/**
 * Create Express server.
 */
const app = express()

/**
 * Connect to MongoDB.
 */
console.log(process.env.MONGODB_URI)

mongoose.Promise = global.Promise
mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI)
mongoose.connection.on('error', (err) => {
  console.error(err)
  console.log('%s MongoDB connection error. Please make sure MongoDB is running.', '✗')
  process.exit()
})

/**
 * Initilaize database configuration
 */
let initializeDatatbase = databaseConfig.initialize()
initializeDatatbase.then(response => {
  console.log(response)
})


/**
 * Allow CORS request for dev server
 */
app.use(cors({credentials: true, origin: true}))


/**
 * Express configuration.
 */
app.set('host', '0.0.0.0')
app.set('port', 1169) // A P I = 1 16 9
app.use(compression())
app.use(bodyParser.json())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }))
app.use(fileUpload())

/**
 * Sessions configuration
 */
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
  store: new MongoStore({
    url: process.env.MONGODB_URI || process.env.MONGOLAB_URI,
    autoReconnect: true,
    clear_interval: 3600
  })
}))
app.use(passport.initialize())
app.use(passport.session())

app.use((req, res, next) => {
  res.locals.user = req.user
  next()
})

/**
 * Controllers (routes handlers).
 */
require('./controllers/security')(app)
require('./controllers/user')(app)
require('./controllers/notification')(app)
require('./controllers/database')(app)

/**
 * Business routes
 */
require('./controllers/expert')(app)
require('./controllers/customer')(app)
require('./controllers/support')(app)
require('./controllers/admin')(app)

/**
 * Start Express server.
 */
let server = app.listen(app.get('port'), () => {
  console.log('%s App is running at http://localhost:%d in %s mode', '✓', app.get('port'), app.get('env'))
  console.log('  Press CTRL-C to stop\n')
})

/*
const io = socket(server)
io.on('connection', (socket) => {
  console.log('a user connected', socket.id)
  socket.on('SEND_MESSAGE', (data) => {
    console.log('Message recieved', data)  
    io.emit('RECEIVE_MESSAGE', data)
  })
})
*/