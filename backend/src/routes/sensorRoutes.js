'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/sensorController');

router.get('/latest',  ctrl.getLatest);
router.get('/history', ctrl.getHistory);
router.get('/summary', ctrl.getSummary);

module.exports = router;
