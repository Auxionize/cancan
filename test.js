'use strict';

/**
 * Dependencies
 */

const cancan = require('./');

const authorize = cancan.authorize;
const cannot = cancan.cannot;
const can = cancan.can;

const chai = require('chai');
chai.use(require('chai-as-promised'));

chai.should();


/**
 * Example classes
 */

class User {

}

class Product {
	constructor(attrs) {
		this.attrs = attrs || {};
	}

	get(key) {
		return this.attrs[key];
	}
}


/**
 * Tests
 */

describe('cancan', function () {

	it('allow one action', function* () {

		cancan.configure(User, function (user) {
			this.can('read', Product);
		});

		let user = new User();
		let product = new Product();

		(yield can(user, 'read', product)).should.equal(true);
		(yield cannot(user, 'read', product)).should.equal(false);
		(yield can(user, 'create', product)).should.equal(false);
	});

	it('allow many actions', function* () {
		cancan.configure(User, function (user) {
			this.can(['read', 'create', 'destroy'], Product);
		});

		let user = new User();
		let product = new Product();

		(yield can(user, 'read', product)).should.equal(true);
		(yield can(user, 'create', product)).should.equal(true);
		(yield can(user, 'destroy', product)).should.equal(true);
	});

	it('allow all actions using "manage"', function* () {
		cancan.configure(User, function (user) {
			this.can('manage', Product);
		});

		let user = new User();
		let product = new Product();

		(yield can(user, 'read', product)).should.equal(true);
		(yield can(user, 'create', product)).should.equal(true);
		(yield can(user, 'update', product)).should.equal(true);
		(yield can(user, 'destroy', product)).should.equal(true);
		(yield can(user, 'modify', product)).should.equal(true);
	});

	it('allow all actions and all objects', function* () {
		cancan.configure(User, function (user) {
			this.can('manage', 'all');
		});

		let user = new User();
		let product = new Product();

		(yield can(user, 'read', user)).should.equal(true);
		(yield can(user, 'read', product)).should.equal(true);
	});

	it('allow only certain items', function* () {
		cancan.configure(User, function (user) {
			this.can('read', Product, {published: true});
		});

		let user = new User();
		let privateProduct = new Product();
		let publicProduct = new Product({published: true});

		(yield can(user, 'read', privateProduct)).should.equal(false);
		(yield can(user, 'read', publicProduct)).should.equal(true);
	});

	it('allow only certain items via validator function', function* () {
		cancan.configure(User, function (user) {
			this.can('read', Product, function (product) {
				return product.get('published') === true;
			});
		});

		let user = new User();
		let privateProduct = new Product();
		let publicProduct = new Product({published: true});

		(yield can(user, 'read', privateProduct)).should.equal(false);
		(yield can(user, 'read', publicProduct)).should.equal(true);
	});

	it('allow only certain items via asyncronous validator function', function* () {
		cancan.configure(User, function (user) {
			this.can('read', Product, function* (product) {
				let isPublic = new Promise(function (resolve) {
					resolve(product.get('published'))
				});

				return (yield isPublic) === true;
			});
		});

		let user = new User();
		let privateProduct = new Product();
		let publicProduct = new Product({published: true});

		(yield can(user, 'read', privateProduct)).should.equal(false, 'A private product is readable');
		(yield can(user, 'read', publicProduct)).should.equal(true, 'A public product is not readable');
	});

	it('throw an exception', function* () {
		cancan.configure(User, function (user) {
			this.can('read', Product, function (product) {
				return product.get('published') === true;
			});
		});

		let user = new User();
		let privateProduct = new Product();
		let publicProduct = new Product({published: true});

		yield authorize(user, 'read', publicProduct);

		try {
			yield authorize(user, 'read', privateProduct);
		} catch (e) {
			e.status.should.equal(401);
			return;
		}

		throw new Error('Exception was not fired');
	});

});
