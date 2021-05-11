"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsdevhourStack = void 0;
const cdk = require("@aws-cdk/core");
const core_1 = require("@aws-cdk/core");
const aws_apigateway_1 = require("@aws-cdk/aws-apigateway");
const aws_s3_1 = require("@aws-cdk/aws-s3");
const s3 = require("@aws-cdk/aws-s3");
const iam = require("@aws-cdk/aws-iam");
const dynamodb = require("@aws-cdk/aws-dynamodb");
const lambda = require("@aws-cdk/aws-lambda");
const event_sources = require("@aws-cdk/aws-lambda-event-sources");
const cognito = require("@aws-cdk/aws-cognito");
const apigw = require("@aws-cdk/aws-apigateway");
const s3deploy = require("@aws-cdk/aws-s3-deployment");
const sqs = require("@aws-cdk/aws-sqs");
const s3n = require("@aws-cdk/aws-s3-notifications");
const imageBucketName = "cdk-rekn-imgagebucket";
const resizedBucketName = imageBucketName + "-resized";
const websiteBucketName = "cdk-rekn-publicbucket";
class AwsdevhourStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // =====================================================================================
        // Image Bucket
        // =====================================================================================
        const imageBucket = new s3.Bucket(this, imageBucketName, {
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        new cdk.CfnOutput(this, 'imageBucket', { value: imageBucket.bucketName });
        const imageBucketArn = imageBucket.bucketArn;
        imageBucket.addCorsRule({
            allowedMethods: [aws_s3_1.HttpMethods.GET, aws_s3_1.HttpMethods.PUT],
            allowedOrigins: ["*"],
            allowedHeaders: ["*"],
            maxAge: 3000
        });
        // =====================================================================================
        // Thumbnail Bucket
        // =====================================================================================
        const resizedBucket = new s3.Bucket(this, resizedBucketName, {
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        new cdk.CfnOutput(this, 'resizedBucket', { value: resizedBucket.bucketName });
        const resizedBucketArn = resizedBucket.bucketArn;
        resizedBucket.addCorsRule({
            allowedMethods: [aws_s3_1.HttpMethods.GET, aws_s3_1.HttpMethods.PUT],
            allowedOrigins: ["*"],
            allowedHeaders: ["*"],
            maxAge: 3000
        });
        // =====================================================================================
        // Construct to create our Amazon S3 Bucket to host our website
        // =====================================================================================
        const webBucket = new s3.Bucket(this, websiteBucketName, {
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'index.html',
            removalPolicy: cdk.RemovalPolicy.DESTROY
            // publicReadAccess: true,
        });
        webBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [webBucket.arnForObjects('*')],
            principals: [new iam.AnyPrincipal()],
            conditions: {
                'IpAddress': {
                    'aws:SourceIp': [
                        '*.*.*.*/*' // Please change it to your IP address or from your allowed list
                    ]
                }
            }
        }));
        new cdk.CfnOutput(this, 'bucketURL', { value: webBucket.bucketWebsiteDomainName });
        // =====================================================================================
        // Deploy site contents to S3 Bucket
        // =====================================================================================
        new s3deploy.BucketDeployment(this, 'DeployWebsite', {
            sources: [s3deploy.Source.asset('./public')],
            destinationBucket: webBucket
        });
        // =====================================================================================
        // Amazon DynamoDB table for storing image labels
        // =====================================================================================
        const table = new dynamodb.Table(this, 'ImageLabels', {
            partitionKey: { name: 'image', type: dynamodb.AttributeType.STRING },
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        new cdk.CfnOutput(this, 'ddbTable', { value: table.tableName });
        // =====================================================================================
        // Building our AWS Lambda Function; compute for our serverless microservice
        // =====================================================================================
        const layer = new lambda.LayerVersion(this, 'pil', {
            code: lambda.Code.fromAsset('reklayer'),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_7],
            license: 'Apache-2.0',
            description: 'A layer to enable the PIL library in our Rekognition Lambda',
        });
        // =====================================================================================
        // Building our AWS Lambda Function; compute for our serverless microservice
        // =====================================================================================
        const rekFn = new lambda.Function(this, 'rekognitionFunction', {
            code: lambda.Code.fromAsset('rekognitionlambda'),
            runtime: lambda.Runtime.PYTHON_3_7,
            handler: 'index.handler',
            timeout: core_1.Duration.seconds(30),
            memorySize: 1024,
            layers: [layer],
            environment: {
                "TABLE": table.tableName,
                "BUCKET": imageBucket.bucketName,
                "RESIZEDBUCKET": resizedBucket.bucketName
            },
        });
        imageBucket.grantRead(rekFn);
        resizedBucket.grantPut(rekFn);
        table.grantWriteData(rekFn);
        rekFn.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['rekognition:DetectLabels'],
            resources: ['*']
        }));
        // =====================================================================================
        // Lambda for Synchronous Front End
        // =====================================================================================
        const serviceFn = new lambda.Function(this, 'serviceFunction', {
            code: lambda.Code.fromAsset('servicelambda'),
            runtime: lambda.Runtime.PYTHON_3_7,
            handler: 'index.handler',
            environment: {
                "TABLE": table.tableName,
                "BUCKET": imageBucket.bucketName,
                "RESIZEDBUCKET": resizedBucket.bucketName
            },
        });
        imageBucket.grantWrite(serviceFn);
        resizedBucket.grantWrite(serviceFn);
        table.grantReadWriteData(serviceFn);
        const api = new apigw.LambdaRestApi(this, 'imageAPI', {
            defaultCorsPreflightOptions: {
                allowOrigins: apigw.Cors.ALL_ORIGINS,
                allowMethods: apigw.Cors.ALL_METHODS
            },
            handler: serviceFn,
            proxy: false,
        });
        // =====================================================================================
        // This construct builds a new Amazon API Gateway with AWS Lambda Integration
        // =====================================================================================
        const lambdaIntegration = new apigw.LambdaIntegration(serviceFn, {
            proxy: false,
            requestParameters: {
                'integration.request.querystring.action': 'method.request.querystring.action',
                'integration.request.querystring.key': 'method.request.querystring.key'
            },
            requestTemplates: {
                'application/json': JSON.stringify({ action: "$util.escapeJavaScript($input.params('action'))", key: "$util.escapeJavaScript($input.params('key'))" })
            },
            passthroughBehavior: aws_apigateway_1.PassthroughBehavior.WHEN_NO_TEMPLATES,
            integrationResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        // We can map response parameters
                        // - Destination parameters (the key) are the response parameters (used in mappings)
                        // - Source parameters (the value) are the integration response parameters or expressions
                        'method.response.header.Access-Control-Allow-Origin': "'*'"
                    }
                },
                {
                    // For errors, we check if the error message is not empty, get the error data
                    selectionPattern: "(\n|.)+",
                    statusCode: "500",
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': "'*'"
                    }
                }
            ],
        });
        // =====================================================================================
        // Cognito User Pool Authentication
        // =====================================================================================
        const userPool = new cognito.UserPool(this, "UserPool", {
            selfSignUpEnabled: true,
            autoVerify: { email: true },
            signInAliases: { username: true, email: true }, // Set email as an alias
        });
        const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
            userPool,
            generateSecret: false, // Don't need to generate secret for web app running on browsers
        });
        const identityPool = new cognito.CfnIdentityPool(this, "ImageRekognitionIdentityPool", {
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: userPoolClient.userPoolClientId,
                    providerName: userPool.userPoolProviderName,
                },
            ],
        });
        const auth = new apigw.CfnAuthorizer(this, 'APIGatewayAuthorizer', {
            name: 'customer-authorizer',
            identitySource: 'method.request.header.Authorization',
            providerArns: [userPool.userPoolArn],
            restApiId: api.restApiId,
            type: aws_apigateway_1.AuthorizationType.COGNITO,
        });
        const authenticatedRole = new iam.Role(this, "ImageRekognitionAuthenticatedRole", {
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "authenticated",
                },
            }, "sts:AssumeRoleWithWebIdentity"),
        });
        // IAM policy granting users permission to upload, download and delete their own pictures
        authenticatedRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                "s3:GetObject",
                "s3:PutObject"
            ],
            effect: iam.Effect.ALLOW,
            resources: [
                imageBucketArn + "/private/${cognito-identity.amazonaws.com:sub}/*",
                imageBucketArn + "/private/${cognito-identity.amazonaws.com:sub}",
                resizedBucketArn + "/private/${cognito-identity.amazonaws.com:sub}/*",
                resizedBucketArn + "/private/${cognito-identity.amazonaws.com:sub}"
            ],
        }));
        // IAM policy granting users permission to list their pictures
        authenticatedRole.addToPolicy(new iam.PolicyStatement({
            actions: ["s3:ListBucket"],
            effect: iam.Effect.ALLOW,
            resources: [
                imageBucketArn,
                resizedBucketArn
            ],
            conditions: { "StringLike": { "s3:prefix": ["private/${cognito-identity.amazonaws.com:sub}/*"] } }
        }));
        new cognito.CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoleAttachment", {
            identityPoolId: identityPool.ref,
            roles: { authenticated: authenticatedRole.roleArn },
        });
        // Export values of Cognito
        new core_1.CfnOutput(this, "UserPoolId", {
            value: userPool.userPoolId,
        });
        new core_1.CfnOutput(this, "AppClientId", {
            value: userPoolClient.userPoolClientId,
        });
        new core_1.CfnOutput(this, "IdentityPoolId", {
            value: identityPool.ref,
        });
        // =====================================================================================
        // API Gateway
        // =====================================================================================
        const imageAPI = api.root.addResource('images');
        // GET /images
        imageAPI.addMethod('GET', lambdaIntegration, {
            authorizationType: aws_apigateway_1.AuthorizationType.COGNITO,
            authorizer: { authorizerId: auth.ref },
            requestParameters: {
                'method.request.querystring.action': true,
                'method.request.querystring.key': true
            },
            methodResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: "500",
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                }
            ]
        });
        // DELETE /images
        imageAPI.addMethod('DELETE', lambdaIntegration, {
            authorizationType: aws_apigateway_1.AuthorizationType.COGNITO,
            authorizer: { authorizerId: auth.ref },
            requestParameters: {
                'method.request.querystring.action': true,
                'method.request.querystring.key': true
            },
            methodResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: "500",
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                }
            ]
        });
        // =====================================================================================
        // Building SQS queue and DeadLetter Queue
        // =====================================================================================
        const dlQueue = new sqs.Queue(this, 'ImageDLQueue', {
            queueName: 'ImageDLQueue'
        });
        const queue = new sqs.Queue(this, 'ImageQueue', {
            queueName: 'ImageQueue',
            visibilityTimeout: cdk.Duration.seconds(30),
            receiveMessageWaitTime: cdk.Duration.seconds(20),
            deadLetterQueue: {
                maxReceiveCount: 2,
                queue: dlQueue
            }
        });
        // =====================================================================================
        // Building S3 Bucket Create Notification to SQS
        // =====================================================================================
        imageBucket.addObjectCreatedNotification(new s3n.SqsDestination(queue), { prefix: 'private/' });
        // =====================================================================================
        // Lambda(Rekognition) to consume messages from SQS
        // =====================================================================================
        rekFn.addEventSource(new event_sources.SqsEventSource(queue));
    }
}
exports.AwsdevhourStack = AwsdevhourStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXdzZGV2aG91ci1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF3c2RldmhvdXItc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscUNBQXFDO0FBQ3JDLHdDQUFrRDtBQUNsRCw0REFBK0U7QUFDL0UsNENBQTRDO0FBQzVDLHNDQUF1QztBQUN2Qyx3Q0FBeUM7QUFDekMsa0RBQW1EO0FBQ25ELDhDQUErQztBQUMvQyxtRUFBb0U7QUFDcEUsZ0RBQWlEO0FBQ2pELGlEQUFrRDtBQUNsRCx1REFBd0Q7QUFDeEQsd0NBQXlDO0FBQ3pDLHFEQUFzRDtBQUV0RCxNQUFNLGVBQWUsR0FBRyx1QkFBdUIsQ0FBQTtBQUMvQyxNQUFNLGlCQUFpQixHQUFHLGVBQWUsR0FBRyxVQUFVLENBQUE7QUFDdEQsTUFBTSxpQkFBaUIsR0FBRyx1QkFBdUIsQ0FBQTtBQUVqRCxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUMsWUFBWSxLQUFvQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix3RkFBd0Y7UUFDeEYsZUFBZTtRQUNmLHdGQUF3RjtRQUN4RixNQUFNLFdBQVcsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2RCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztRQUNILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLE1BQU0sY0FBYyxHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUM7UUFDN0MsV0FBVyxDQUFDLFdBQVcsQ0FBQztZQUN0QixjQUFjLEVBQUUsQ0FBQyxvQkFBVyxDQUFDLEdBQUcsRUFBRSxv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QUN4RixNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUNsRCxTQUFTLEVBQUUsY0FBYztTQUMxQixDQUFDLENBQUE7UUFFRixNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUM5QyxTQUFTLEVBQUUsWUFBWTtZQUN2QixpQkFBaUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDM0Msc0JBQXNCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2hELGVBQWUsRUFBRTtnQkFDZixlQUFlLEVBQUUsQ0FBQztnQkFDbEIsS0FBSyxFQUFFLE9BQU87YUFDZjtTQUNGLENBQUMsQ0FBQztRQUVILHdGQUF3RjtRQUN4RixnREFBZ0Q7UUFDaEQsd0ZBQXdGO1FBQ3hGLFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQTtRQUUvRix3RkFBd0Y7UUFDeEYsbURBQW1EO1FBQ25ELHdGQUF3RjtRQUN4RixLQUFLLENBQUMsY0FBYyxDQUFDLElBQUksYUFBYSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7Q0FDRjtBQTdWRCwwQ0E2VkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcbmltcG9ydCB7Q2ZuT3V0cHV0LCBEdXJhdGlvbn0gZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcbmltcG9ydCB7QXV0aG9yaXphdGlvblR5cGUsIFBhc3N0aHJvdWdoQmVoYXZpb3J9IGZyb20gXCJAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheVwiO1xuaW1wb3J0IHtIdHRwTWV0aG9kc30gZnJvbSBcIkBhd3MtY2RrL2F3cy1zM1wiO1xuaW1wb3J0IHMzID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLXMzJyk7XG5pbXBvcnQgaWFtID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWlhbScpO1xuaW1wb3J0IGR5bmFtb2RiID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWR5bmFtb2RiJyk7XG5pbXBvcnQgbGFtYmRhID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWxhbWJkYScpO1xuaW1wb3J0IGV2ZW50X3NvdXJjZXMgPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnKTtcbmltcG9ydCBjb2duaXRvID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWNvZ25pdG8nKTtcbmltcG9ydCBhcGlndyA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5Jyk7XG5pbXBvcnQgczNkZXBsb3kgPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtczMtZGVwbG95bWVudCcpO1xuaW1wb3J0IHNxcyA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2F3cy1zcXMnKTtcbmltcG9ydCBzM24gPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtczMtbm90aWZpY2F0aW9ucycpO1xuXG5jb25zdCBpbWFnZUJ1Y2tldE5hbWUgPSBcImNkay1yZWtuLWltZ2FnZWJ1Y2tldFwiXG5jb25zdCByZXNpemVkQnVja2V0TmFtZSA9IGltYWdlQnVja2V0TmFtZSArIFwiLXJlc2l6ZWRcIlxuY29uc3Qgd2Vic2l0ZUJ1Y2tldE5hbWUgPSBcImNkay1yZWtuLXB1YmxpY2J1Y2tldFwiXG5cbmV4cG9ydCBjbGFzcyBBd3NkZXZob3VyU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogY2RrLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEltYWdlIEJ1Y2tldFxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBpbWFnZUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgaW1hZ2VCdWNrZXROYW1lLCB7XG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ2ltYWdlQnVja2V0JywgeyB2YWx1ZTogaW1hZ2VCdWNrZXQuYnVja2V0TmFtZSB9KTtcbiAgICBjb25zdCBpbWFnZUJ1Y2tldEFybiA9IGltYWdlQnVja2V0LmJ1Y2tldEFybjtcbiAgICBpbWFnZUJ1Y2tldC5hZGRDb3JzUnVsZSh7XG4gICAgICBhbGxvd2VkTWV0aG9kczogW0h0dHBNZXRob2RzLkdFVCwgSHR0cE1ldGhvZHMuUFVUXSxcbiAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICBtYXhBZ2U6IDMwMDBcbiAgICB9KTtcbiAgICBcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gVGh1bWJuYWlsIEJ1Y2tldFxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCByZXNpemVkQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCByZXNpemVkQnVja2V0TmFtZSwge1xuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdyZXNpemVkQnVja2V0Jywge3ZhbHVlOiByZXNpemVkQnVja2V0LmJ1Y2tldE5hbWV9KTtcbiAgICBjb25zdCByZXNpemVkQnVja2V0QXJuID0gcmVzaXplZEJ1Y2tldC5idWNrZXRBcm47XG4gICAgcmVzaXplZEJ1Y2tldC5hZGRDb3JzUnVsZSh7XG4gICAgICBhbGxvd2VkTWV0aG9kczogW0h0dHBNZXRob2RzLkdFVCwgSHR0cE1ldGhvZHMuUFVUXSxcbiAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICBtYXhBZ2U6IDMwMDBcbiAgICB9KTtcbiAgICBcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQ29uc3RydWN0IHRvIGNyZWF0ZSBvdXIgQW1hem9uIFMzIEJ1Y2tldCB0byBob3N0IG91ciB3ZWJzaXRlXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IHdlYkJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgd2Vic2l0ZUJ1Y2tldE5hbWUsIHtcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiAnaW5kZXguaHRtbCcsXG4gICAgICB3ZWJzaXRlRXJyb3JEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgICAgLy8gcHVibGljUmVhZEFjY2VzczogdHJ1ZSxcbiAgICB9KTtcbiAgICBcbiAgICB3ZWJCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbd2ViQnVja2V0LmFybkZvck9iamVjdHMoJyonKV0sXG4gICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BbnlQcmluY2lwYWwoKV0sXG4gICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICdJcEFkZHJlc3MnOiB7XG4gICAgICAgICAgJ2F3czpTb3VyY2VJcCc6IFtcbiAgICAgICAgICAgICcqLiouKi4qLyonIC8vIFBsZWFzZSBjaGFuZ2UgaXQgdG8geW91ciBJUCBhZGRyZXNzIG9yIGZyb20geW91ciBhbGxvd2VkIGxpc3RcbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgfSkpXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ2J1Y2tldFVSTCcsIHsgdmFsdWU6IHdlYkJ1Y2tldC5idWNrZXRXZWJzaXRlRG9tYWluTmFtZSB9KTtcbiAgICBcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gRGVwbG95IHNpdGUgY29udGVudHMgdG8gUzMgQnVja2V0XG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIG5ldyBzM2RlcGxveS5CdWNrZXREZXBsb3ltZW50KHRoaXMsICdEZXBsb3lXZWJzaXRlJywge1xuICAgICAgICBzb3VyY2VzOiBbIHMzZGVwbG95LlNvdXJjZS5hc3NldCgnLi9wdWJsaWMnKSBdLFxuICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogd2ViQnVja2V0XG4gICAgfSk7XG4gICAgXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEFtYXpvbiBEeW5hbW9EQiB0YWJsZSBmb3Igc3RvcmluZyBpbWFnZSBsYWJlbHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgdGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0ltYWdlTGFiZWxzJywge1xuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdpbWFnZScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ2RkYlRhYmxlJywgeyB2YWx1ZTogdGFibGUudGFibGVOYW1lIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEJ1aWxkaW5nIG91ciBBV1MgTGFtYmRhIEZ1bmN0aW9uOyBjb21wdXRlIGZvciBvdXIgc2VydmVybGVzcyBtaWNyb3NlcnZpY2VcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgbGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCAncGlsJywge1xuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdyZWtsYXllcicpLFxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfN10sXG4gICAgICBsaWNlbnNlOiAnQXBhY2hlLTIuMCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0EgbGF5ZXIgdG8gZW5hYmxlIHRoZSBQSUwgbGlicmFyeSBpbiBvdXIgUmVrb2duaXRpb24gTGFtYmRhJyxcbiAgICB9KTtcbiAgICAgIOKAi1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBCdWlsZGluZyBvdXIgQVdTIExhbWJkYSBGdW5jdGlvbjsgY29tcHV0ZSBmb3Igb3VyIHNlcnZlcmxlc3MgbWljcm9zZXJ2aWNlXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IHJla0ZuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAncmVrb2duaXRpb25GdW5jdGlvbicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgncmVrb2duaXRpb25sYW1iZGEnKSxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzcsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICBsYXllcnM6IFtsYXllcl0sXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFwiVEFCTEVcIjogdGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFwiQlVDS0VUXCI6IGltYWdlQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgXCJSRVNJWkVEQlVDS0VUXCI6IHJlc2l6ZWRCdWNrZXQuYnVja2V0TmFtZVxuICAgICAgfSxcbiAgICB9KTtcbiAgICBcbiAgICBpbWFnZUJ1Y2tldC5ncmFudFJlYWQocmVrRm4pO1xuICAgIHJlc2l6ZWRCdWNrZXQuZ3JhbnRQdXQocmVrRm4pO1xuICAgIHRhYmxlLmdyYW50V3JpdGVEYXRhKHJla0ZuKTtcblxuICAgIHJla0ZuLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ3Jla29nbml0aW9uOkRldGVjdExhYmVscyddLFxuICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgIH0pKTtcbiAgICBcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gTGFtYmRhIGZvciBTeW5jaHJvbm91cyBGcm9udCBFbmRcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIOKAi1xuICAgIGNvbnN0IHNlcnZpY2VGbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ3NlcnZpY2VGdW5jdGlvbicsIHtcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnc2VydmljZWxhbWJkYScpLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfNyxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFwiVEFCTEVcIjogdGFibGUudGFibGVOYW1lLFxuICAgICAgICBcIkJVQ0tFVFwiOiBpbWFnZUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBcIlJFU0laRURCVUNLRVRcIjogcmVzaXplZEJ1Y2tldC5idWNrZXROYW1lXG4gICAgICB9LFxuICAgIH0pO1xuICAgIOKAi1xuICAgIGltYWdlQnVja2V0LmdyYW50V3JpdGUoc2VydmljZUZuKTtcbiAgICByZXNpemVkQnVja2V0LmdyYW50V3JpdGUoc2VydmljZUZuKTtcbiAgICB0YWJsZS5ncmFudFJlYWRXcml0ZURhdGEoc2VydmljZUZuKTtcbiAgICBcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ3cuTGFtYmRhUmVzdEFwaSh0aGlzLCAnaW1hZ2VBUEknLCB7XG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlndy5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWd3LkNvcnMuQUxMX01FVEhPRFNcbiAgICAgIH0sXG4gICAgICBoYW5kbGVyOiBzZXJ2aWNlRm4sXG4gICAgICBwcm94eTogZmFsc2UsXG4gICAgfSk7XG4gICAgXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFRoaXMgY29uc3RydWN0IGJ1aWxkcyBhIG5ldyBBbWF6b24gQVBJIEdhdGV3YXkgd2l0aCBBV1MgTGFtYmRhIEludGVncmF0aW9uXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGxhbWJkYUludGVncmF0aW9uID0gbmV3IGFwaWd3LkxhbWJkYUludGVncmF0aW9uKHNlcnZpY2VGbiwge1xuICAgICAgcHJveHk6IGZhbHNlLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ2ludGVncmF0aW9uLnJlcXVlc3QucXVlcnlzdHJpbmcuYWN0aW9uJzogJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLmFjdGlvbicsXG4gICAgICAgICdpbnRlZ3JhdGlvbi5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLmtleSc6ICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5rZXknXG4gICAgICB9LFxuICAgICAgcmVxdWVzdFRlbXBsYXRlczoge1xuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHsgYWN0aW9uOiBcIiR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0LnBhcmFtcygnYWN0aW9uJykpXCIsIGtleTogXCIkdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5wYXJhbXMoJ2tleScpKVwiIH0pXG4gICAgICB9LFxuICAgICAgcGFzc3Rocm91Z2hCZWhhdmlvcjogUGFzc3Rocm91Z2hCZWhhdmlvci5XSEVOX05PX1RFTVBMQVRFUyxcbiAgICAgIGludGVncmF0aW9uUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiBcIjIwMFwiLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgLy8gV2UgY2FuIG1hcCByZXNwb25zZSBwYXJhbWV0ZXJzXG4gICAgICAgICAgICAvLyAtIERlc3RpbmF0aW9uIHBhcmFtZXRlcnMgKHRoZSBrZXkpIGFyZSB0aGUgcmVzcG9uc2UgcGFyYW1ldGVycyAodXNlZCBpbiBtYXBwaW5ncylcbiAgICAgICAgICAgIC8vIC0gU291cmNlIHBhcmFtZXRlcnMgKHRoZSB2YWx1ZSkgYXJlIHRoZSBpbnRlZ3JhdGlvbiByZXNwb25zZSBwYXJhbWV0ZXJzIG9yIGV4cHJlc3Npb25zXG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIicqJ1wiXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgLy8gRm9yIGVycm9ycywgd2UgY2hlY2sgaWYgdGhlIGVycm9yIG1lc3NhZ2UgaXMgbm90IGVtcHR5LCBnZXQgdGhlIGVycm9yIGRhdGFcbiAgICAgICAgICBzZWxlY3Rpb25QYXR0ZXJuOiBcIihcXG58LikrXCIsXG4gICAgICAgICAgc3RhdHVzQ29kZTogXCI1MDBcIixcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgfSk7XG4gICAgXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIEF1dGhlbnRpY2F0aW9uXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgXCJVc2VyUG9vbFwiLCB7XG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSwgLy8gQWxsb3cgdXNlcnMgdG8gc2lnbiB1cFxuICAgICAgYXV0b1ZlcmlmeTogeyBlbWFpbDogdHJ1ZSB9LCAvLyBWZXJpZnkgZW1haWwgYWRkcmVzc2VzIGJ5IHNlbmRpbmcgYSB2ZXJpZmljYXRpb24gY29kZVxuICAgICAgc2lnbkluQWxpYXNlczogeyB1c2VybmFtZTogdHJ1ZSwgZW1haWw6IHRydWUgfSwgLy8gU2V0IGVtYWlsIGFzIGFuIGFsaWFzXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsIFwiVXNlclBvb2xDbGllbnRcIiwge1xuICAgICAgdXNlclBvb2wsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsIC8vIERvbid0IG5lZWQgdG8gZ2VuZXJhdGUgc2VjcmV0IGZvciB3ZWIgYXBwIHJ1bm5pbmcgb24gYnJvd3NlcnNcbiAgICB9KTtcblxuICAgIGNvbnN0IGlkZW50aXR5UG9vbCA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbCh0aGlzLCBcIkltYWdlUmVrb2duaXRpb25JZGVudGl0eVBvb2xcIiwge1xuICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSwgLy8gRG9uJ3QgYWxsb3cgdW5hdGhlbnRpY2F0ZWQgdXNlcnNcbiAgICAgIGNvZ25pdG9JZGVudGl0eVByb3ZpZGVyczogW1xuICAgICAgICB7XG4gICAgICAgIGNsaWVudElkOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICBwcm92aWRlck5hbWU6IHVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGF1dGggPSBuZXcgYXBpZ3cuQ2ZuQXV0aG9yaXplcih0aGlzLCAnQVBJR2F0ZXdheUF1dGhvcml6ZXInLCB7XG4gICAgICBuYW1lOiAnY3VzdG9tZXItYXV0aG9yaXplcicsXG4gICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICAgIHByb3ZpZGVyQXJuczogW3VzZXJQb29sLnVzZXJQb29sQXJuXSxcbiAgICAgIHJlc3RBcGlJZDogYXBpLnJlc3RBcGlJZCxcbiAgICAgIHR5cGU6IEF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIkltYWdlUmVrb2duaXRpb25BdXRoZW50aWNhdGVkUm9sZVwiLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkXCI6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIkZvckFueVZhbHVlOlN0cmluZ0xpa2VcIjoge1xuICAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yXCI6IFwiYXV0aGVudGljYXRlZFwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIlxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIElBTSBwb2xpY3kgZ3JhbnRpbmcgdXNlcnMgcGVybWlzc2lvbiB0byB1cGxvYWQsIGRvd25sb2FkIGFuZCBkZWxldGUgdGhlaXIgb3duIHBpY3R1cmVzXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcInMzOkdldE9iamVjdFwiLFxuICAgICAgICAgIFwiczM6UHV0T2JqZWN0XCJcbiAgICAgICAgXSxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBpbWFnZUJ1Y2tldEFybiArIFwiL3ByaXZhdGUvJHtjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206c3VifS8qXCIsXG4gICAgICAgICAgaW1hZ2VCdWNrZXRBcm4gKyBcIi9wcml2YXRlLyR7Y29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOnN1Yn1cIixcbiAgICAgICAgICByZXNpemVkQnVja2V0QXJuICsgXCIvcHJpdmF0ZS8ke2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTpzdWJ9LypcIixcbiAgICAgICAgICByZXNpemVkQnVja2V0QXJuICsgXCIvcHJpdmF0ZS8ke2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTpzdWJ9XCJcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIElBTSBwb2xpY3kgZ3JhbnRpbmcgdXNlcnMgcGVybWlzc2lvbiB0byBsaXN0IHRoZWlyIHBpY3R1cmVzXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcInMzOkxpc3RCdWNrZXRcIl0sXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgaW1hZ2VCdWNrZXRBcm4sXG4gICAgICAgICAgcmVzaXplZEJ1Y2tldEFyblxuICAgICAgICBdLFxuICAgICAgICBjb25kaXRpb25zOiB7XCJTdHJpbmdMaWtlXCI6IHtcInMzOnByZWZpeFwiOiBbXCJwcml2YXRlLyR7Y29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOnN1Yn0vKlwiXX19XG4gICAgICB9KVxuICAgICk7XG5cbiAgICBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCh0aGlzLCBcIklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50XCIsIHtcbiAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgcm9sZXM6IHsgYXV0aGVudGljYXRlZDogYXV0aGVudGljYXRlZFJvbGUucm9sZUFybiB9LFxuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0IHZhbHVlcyBvZiBDb2duaXRvXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlVzZXJQb29sSWRcIiwge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgfSk7XG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIkFwcENsaWVudElkXCIsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJJZGVudGl0eVBvb2xJZFwiLCB7XG4gICAgICB2YWx1ZTogaWRlbnRpdHlQb29sLnJlZixcbiAgICB9KTtcblxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGltYWdlQVBJID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2ltYWdlcycpO1xuICAgIOKAi1xuICAgIC8vIEdFVCAvaW1hZ2VzXG4gICAgaW1hZ2VBUEkuYWRkTWV0aG9kKCdHRVQnLCBsYW1iZGFJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IEF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogYXV0aC5yZWYgfSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5xdWVyeXN0cmluZy5hY3Rpb24nOiB0cnVlLFxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcua2V5JzogdHJ1ZVxuICAgICAgfSxcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogXCIyMDBcIixcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IFwiNTAwXCIsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcbiAgICBcbiAgICAvLyBERUxFVEUgL2ltYWdlc1xuICAgIGltYWdlQVBJLmFkZE1ldGhvZCgnREVMRVRFJywgbGFtYmRhSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBBdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgYXV0aG9yaXplcjogeyBhdXRob3JpemVySWQ6IGF1dGgucmVmIH0sXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcuYWN0aW9uJzogdHJ1ZSxcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnF1ZXJ5c3RyaW5nLmtleSc6IHRydWVcbiAgICAgIH0sXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IFwiMjAwXCIsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiBcIjUwMFwiLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG4gICAgXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEJ1aWxkaW5nIFNRUyBxdWV1ZSBhbmQgRGVhZExldHRlciBRdWV1ZVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBkbFF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnSW1hZ2VETFF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiAnSW1hZ2VETFF1ZXVlJ1xuICAgIH0pXG4gICAg4oCLXG4gICAgY29uc3QgcXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdJbWFnZVF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiAnSW1hZ2VRdWV1ZScsXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgcmVjZWl2ZU1lc3NhZ2VXYWl0VGltZTogY2RrLkR1cmF0aW9uLnNlY29uZHMoMjApLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMixcbiAgICAgICAgcXVldWU6IGRsUXVldWVcbiAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQnVpbGRpbmcgUzMgQnVja2V0IENyZWF0ZSBOb3RpZmljYXRpb24gdG8gU1FTXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGltYWdlQnVja2V0LmFkZE9iamVjdENyZWF0ZWROb3RpZmljYXRpb24obmV3IHMzbi5TcXNEZXN0aW5hdGlvbihxdWV1ZSksIHsgcHJlZml4OiAncHJpdmF0ZS8nIH0pXG4gIFxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBMYW1iZGEoUmVrb2duaXRpb24pIHRvIGNvbnN1bWUgbWVzc2FnZXMgZnJvbSBTUVNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgcmVrRm4uYWRkRXZlbnRTb3VyY2UobmV3IGV2ZW50X3NvdXJjZXMuU3FzRXZlbnRTb3VyY2UocXVldWUpKTtcbiAgfVxufVxuIl19