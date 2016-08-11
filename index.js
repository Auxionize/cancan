'use strict';

/**
 * Dependencies
 */

var isPlainObject = require('is-plain-obj');
var isFunction = require('is-function');
var isArray = require('isarray');
var equals = require('equals');
var co = require('co');

/**
 * Configs for each entity
 */

let entityConfigs = [];

/**
 * Expose main functions
 */

module.exports = {
	configure: configure,
	authorize: authorize,
	cannot: cannot,
	can: can,
	reset: function () {
		entityConfigs = [];
		return this;
	}
};

/**
 * CanCan
 */

/**
 * Add a new configuration for a class/entity
 *
 * @param	{Function} entity - entity class/function
 * @param	{Function} config - function that defines rules
 */
function configure(entity, config) {
	if (!isFunction(config)) {
		throw new Error('Config must be a function!');
	}
	entityConfigs.push({
		entity: entity,
		config: config
	});
}

/**
 * Test if an entity instance can execute
 * specific action on a sepcific target
 *
 * @param	{Object} model	- class/entity instance
 * @param	{String} action - action name
 * @param	{Object} target - target instance
 * @return {Promise.<any>} Resolved if action is allowed and rejected otherwise.
 */
function can(model, action, target) {
	let ability = entityConfigs
		.filter(function (item) {
			// check if model is an instance of the current entity
			return model.constructor === item.entity;
		})
		.reduce(function (ability, item) {
			item.config.call(ability, model);
			return ability;
		}, new Ability());

	let args = Array.prototype.slice.call(arguments, 1);

	return co(function* () {
		return yield ability.test.apply(ability, args);
	});
}

/**
 * Return negated result of #can()
 *
 * @return {Promise.<Boolean>} Rejected when can() is resolved and resolved otherwise
 */
function cannot() {
	return can.apply(null, arguments)
		.then(function (result) {
			return !result;
		});
}

/**
 * Same as #can(), but throws an exception if access is not granted
 *
 * @return {Promise<any>} rejected, if authorization rule has NOT returned TRUE; resolved otherwise
 */
function authorize() {
	return can.apply(null, arguments)
		.then(function (result) {
			if (result !== true) {
				return Promise.reject(result);
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
 *
 * @return {void}
 */
Ability.prototype.can = function can() {
	return this.addRule.apply(this, arguments);
};

/**
 * Add a new rule
 *
 * @param {Array|String} actions	 - name or array of names
 * @param {Array|Function} targets - function or array of functions (classes)
 * @param {Function|Object} attrs	- validator function or object of properties
 * @return {void}
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
 * @param	{String} action - action name
 * @param	{Object} target - target object
 * @return {Boolean} TRUE if access should be granted, FALSE otherwise
 */
Ability.prototype.test = function* test(action, target) {
	let args = Array.prototype.slice.call(arguments, 1);
	let attrsMatchResult = false;

	// find a rule that matches the requested action and target
	for (var i = 0; i < this.rules.length; i++) {
		if (actionMatches(action, this.rules[i]) &&
			targetMatches(target, this.rules[i])) {
			let r = yield attrsMatch(args, this.rules[i]);

			if (r === true) {
				return true;
			}
			if (typeof r !== 'undefined') {
				attrsMatchResult = r;
			}
		}
	}

	// There are no matching rules
	return attrsMatchResult;
};

/**
 * Helpers
 */

/**
 * Test if action requirements are satisfied
 *
 * @param	{String} action - action name
 * @param	{Object} rule	 - rule object
 * @return {Boolean} TRUE if action requirements are satisfied
 */
function actionMatches(action, rule) {
	// action should be:
	//	1. equal to rule's action
	//	2. equal to "manage" to allow all actions
	return action === rule.action || rule.action === 'manage';
}

/**
 * Test if target requirements are satisfied
 *
 * @param	{Object} target - target object
 * @param	{Object} rule	 - rule object
 * @return {Boolean} TRUE if target requirements are satisfied
 */
function targetMatches(target, rule) {
	// target should be:
	//	1. an instance of rule's target entity
	//	2. equal to "all" to allow all entities
	return target.constructor === rule.target || rule.target === 'all';
}

/**
 * Test if attributes match
 *
 * @param	{Object} target - target object
 * @param	{Object} rule	 - rule object
 * @return {Boolean} TRUE if attributes match
 */
function attrsMatch(target, rule) {
	// if validator function is set
	// return its result directly
	if (isFunction(rule.attrs)) {
		return rule.attrs.apply(rule, target);
	}

	// test if rule's requirements
	// are satisfied
	if (isPlainObject(rule.attrs)) {
		return Promise.resolve(matches(target[0], rule.attrs));
	}

	// unknown type of attributes
	// or no required attributes at all
	return Promise.resolve(true);
}

/**
 * Get a property of an object
 * and use .get() method, if there is one
 * to support various ORM/ODMs
 *
 * @param {Object} model - target object
 * @param {String} property - wanted property
 * @return {any} The value of the specified `property`
 */
function get(model, property) {
	// support for various ODM/ORMs
	if (isFunction(model.get)) {
		return model.get(property);
	}

	return model[property];
}

/**
 * Determine whether `obj` has all `props` and their exact values
 *
 * @param {Object} obj - target object
 * @param {Object} props - set of required properties
 * @return {Boolean} TRUE if `obj` has all `props` and their exact values
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
