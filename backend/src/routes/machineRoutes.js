'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/machineController');

router.get( '/:machineId/status',  ctrl.getStatus);
router.post('/:machineId/start',   ctrl.start);
router.post('/:machineId/stop',    ctrl.stop);
router.post('/:machineId/reset',   ctrl.reset);
router.post('/:machineId/cycles',  ctrl.setCycles);
router.post('/:machineId/heater',  ctrl.heater);
router.post('/:machineId/pusher',  ctrl.pusher);
router.post('/:machineId/cutter',  ctrl.cutter);

module.exports = router;