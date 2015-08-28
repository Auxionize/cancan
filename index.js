'use strict';

/**
 * Dependencies
 */

var isPlainObject = require('is-plain-obj');
var isFunction = require('is-function');
var isArray = require('isarray');
var equals = require('equals');
var format = require('util').format;
var co = require('co');


/**
 * Expose main functions
 */

module.exports = {
	configure: configure,
	authorize: authorize,
	cannot: cannot,
	can: can
};


/**
 * Configs for each entity
 */

let entityConfigs = [];


/**
 * CanCan
 */

/**
 * Add a new configuration for a class/entity
 *
 * @param  {Function} entity - entity class/function
 * @param  {Function} config - function that defines rules
 */

function configure(entity, config) {
	entityConfigs.push({
		entity: entity,
		config: config
	});
}


/**
 * Test if an entity instance can execute
 * specific action on a sepcific target
 *
 * @param  {Object} model  - class/entity instance
 * @param  {String} action - action name
 * @param  {Object} target - target instance
 * @return {Promise.<Boolean>}
 */

function can(model, action, target) {
	var config = false;

	// find a configuration for a model
	entityConfigs.forEach(function (item) {
		// check if model is an instance of
		// the current entity
		if (model.constructor === item.entity) {
			config = item.config;
		}
	});

	// no configuration found for
	// the current model, quit
	if (!config) {
		return false;
	}

	// configure rules for
	// this entity instance
	var ability = new Ability();
	config.call(ability, model);

	// test for access
	return co(ability.test, action, target);
}


/**
 * Return negated result of #can()
 * @return {Promise.<Boolean>}
 */

function cannot() {
	return can.apply(null, arguments)
		.then(function (result) { return !result; });
}


/**
 * Same as #can(), but throws an exception
 * if access is not granted
 */

function authorize() {
	return can.apply(null, arguments)
		.then(function (result) {
			if (!result) {
				var err = new Error('Not authorized');
				err.status = 401;

				return new Promise.reject(err);
			}

			return result;
		});
}


/**
 * Ability definition
 */

function Ability() {
	this.rules = [];
}


/**
 * Ability#addRule alias
 */

Ability.prototype.can = function can() {
	return this.addRule.apply(this, arguments);
};


/**
 * Add a new rule
 *
 * @param {Array|String} actions   - name or array of names
 * @param {Array|Function} targets - function or array of functions (classes)
 * @param {Function|Object} attrs  - validator function or object of properties
 */

Ability.prototype.addRule = function addRule(actions, targets, attrs) {
	// accept both arrays and single items
	// in actions and targets
	if (!isArray(actions)) {
		actions = [actions];
	}

	if (!isArray(targets)) {
		targets = [targets];
	}

	var ability = this;

	// for each action and target
	// add a new rule
	actions.forEach(function (action) {
		targets.forEach(function (target) {
			ability.rules.push({
				action: action,
				target: target,
				attrs: attrs
			});
		});
	});
};


/**
 * Test if access should be granted
 *
 * @param  {String} action - action name
 * @param  {Object} target - target object
 * @return {Boolean}
 */

Ability.prototype.test = function* test(action, target) {
	// find a rule that matches the requested action and target
	for (var i = 0; i < this.rules.length; i++) {
		if (actionMatches(action, this.rules[i]) &&
			targetMatches(target, this.rules[i]) &&
			(yield attrsMatch(target, this.rules[i]))) {
			return true;
		}
	}

	// There are no matching rules
	return false;
};


/**
 * Helpers
 */

/**
 * Test if action requirements are satisfied
 *
 * @param  {String} action - action name
 * @param  {Object} rule   - rule object
 * @return {Boolean}
 */

function actionMatches(action, rule) {
	// action should be:
	//  1. equal to rule's action
	//  2. equal to "manage" to allow all actions
	return action === rule.action || rule.action === 'manage';
}


/**
 * Test if target requirements are satisfied
 *
 * @param  {Object} target - target object
 * @param  {Object} rule   - rule object
 * @return {Boolean}
 */

function targetMatches(target, rule) {
	// target should be:
	//  1. an instance of rule's target entity
	//  2. equal to "all" to allow all entities
	return target.constructor === rule.target || rule.target === 'all';
}


/**
 * Test if attributes match
 *
 * @param  {Object} target - target object
 * @param  {Object} rule   - rule object
 * @return {Boolean}
 */

function attrsMatch(target, rule) {
	// if validator function is set
	// return its result directly
	if (isFunction(rule.attrs)) {
		return rule.attrs(target);
	}

	// test if rule's requirements
	// are satisfied
	if (isPlainObject(rule.attrs)) {
		return matches(target, rule.attrs);
	}

	// unknown type of attributes
	// or no required attributes at all
	return true;
}


/**
 * Get a property of an object
 * and use .get() method, if there is one
 * to support various ORM/ODMs
 *
 * @param  {Object} model    - target object
 * @param  {String} property - wanted property
 * @return {Mixed}
 */

function get(model, property) {
	// support for various ODM/ORMs
	if (isFunction(model.get)) {
		return model.get(property);
	}

	return model[property];
}


/**
 * Determine whether `obj` has all `props` and
 * their exact values
 *
 * @param  {Object} obj   - target object
 * @param  {Object} props - set of required properties
 * @return {Boolean}
 */

function matches(obj, props) {
	var match = true;

	var keys = Object.keys(props);

	keys.forEach(function (key) {
		var expectedValue = props[key];
		var actualValue = get(obj, key);

		// test if values deep equal
		if (!equals(actualValue, expectedValue)) {
			match = false;
		}
	});

	return match;
}
