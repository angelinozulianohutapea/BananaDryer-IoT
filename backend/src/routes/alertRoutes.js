'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/alertController');

router.get('/',              ctrl.getAll);
router.patch('/ack-all',     ctrl.acknowledgeAll);
router.patch('/:id/ack',     ctrl.acknowledge);

module.exports = router;
