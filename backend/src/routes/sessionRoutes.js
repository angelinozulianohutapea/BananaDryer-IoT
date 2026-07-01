'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/sessionController');

router.get('/',            ctrl.getAll);
router.get('/:id',         ctrl.getById);
router.get('/:id/sensor',  ctrl.getSessionSensor);

module.exports = router;
