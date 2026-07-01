'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/settingsController');

router.get('/', ctrl.getSettings);
router.put('/', ctrl.updateSettings);

module.exports = router;