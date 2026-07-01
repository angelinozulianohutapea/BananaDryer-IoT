'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/machineController');

router.get( '/:machineId/status',  ctrl.getStatus);
router.post('/:machineId/start',   ctrl.start);
router.post('/:machineId/stop',    ctrl.stop);
router.post('/:machineId/reset',   ctrl.reset);
router.post('/:machineId/cycles',  ctrl.setCycles);

module.exports = router;