/*global module, require, process */
var ApiBuilder = require('claudia-api-builder'),
	AWS = require('aws-sdk'),
	mobileanalytics = new AWS.MobileAnalytics(),
	api = new ApiBuilder(),
	denodeify = require('denodeify'),
	readline = require('readline'),
	packageJSON = require('./package.json'),
	ask = function (question, PromiseImpl) {
		'use strict';
		return new PromiseImpl(function (resolve, reject) {
			var rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});
			rl.question(question + '? ', function (answer) {
				rl.close();
				if (answer) {
					resolve(answer);
				} else {
					reject(question + ' must be provided');
				}
			});
		});
	};

module.exports = api;

api.get('/', function (request) {
	'use strict';
	var lambdaTimestamp = new Date().toISOString(),
	clientContext = {
		'client'  : {
			'client_id'       : request.context.user || request.lambdaContext.awsRequestId,
			'app_title'       : request.lambdaContext.functionName,
			'app_version_name': request.context.stage,
			'app_version_code': packageJSON.version,
			'app_package_name': packageJSON.name
		},
		'env'     : {
			'platform'        : 'linux',
			'platform_version': process.version,
			'model'           : process.title,
			'make'            : 'make',
			'locale'          : 'en_US'
		},
		'services': {
			'mobile_analytics': {
				'app_id'     : request.env.analyticsAppId,
				'sdk_name'   : 'aws-sdk-mobile-analytics-js',
				'sdk_version': '0.9.1' + ':' + AWS.VERSION
			}
		},
		'custom' : {}
	},
	event = {
		eventType: 'lambdaPing',
		timestamp: new Date().toISOString(),
		attributes: {
			awsRequestId: request.lambdaContext.awsRequestId,
			path: request.context.path,
			userAgent: request.context.userAgent,
			sourceIp: request.context.sourceIp,
			cognitoIdentity: request.lambdaContext.cognitoIdentityId,
			cognitoAuthenticationProvider: request.lambdaContext.cognitoAuthenticationProvider
		},
		session : {
			'id' :  request.lambdaContext.awsRequestId,
			'startTimestamp' : lambdaTimestamp
		},
		version : 'v2.0',
		metrics: {
			progress: 1
		}
	},
	params = {
		clientContext: JSON.stringify(clientContext),
		events: [event]
	};
	mobileanalytics.putEventsAsync = denodeify(mobileanalytics.putEvents);
	return mobileanalytics.putEventsAsync(params).then(function (result) {
		return {
			sent: params,
			host: mobileanalytics.endpoint.host,
			received: result
		};
	});
});

api.addPostDeployStep('analyticsConfig', function (options, lambdaDetails, utils) {
	'use strict';
	if (options['configure-analytics']) {
		return ask('Mobile Analytics ID', utils.Promise)
			.then(function (appId) {
				var deployment = {
					restApiId: lambdaDetails.apiId,
					stageName: lambdaDetails.alias,
					variables: {
						analyticsAppId: appId
					}
				};
				return utils.apiGatewayPromise.createDeploymentPromise(deployment).then(function () {
					return appId;
				});
			});
	}
});
