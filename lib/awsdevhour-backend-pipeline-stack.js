"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsdevhourBackendPipelineStack = void 0;
const codepipeline = require("@aws-cdk/aws-codepipeline");
const codepipeline_actions = require("@aws-cdk/aws-codepipeline-actions");
const core_1 = require("@aws-cdk/core");
const pipelines_1 = require("@aws-cdk/pipelines");
const awsdevhour_backend_pipeline_stage_1 = require("./awsdevhour-backend-pipeline-stage");
const aws_ssm_1 = require("@aws-cdk/aws-ssm");
const aws_codepipeline_actions_1 = require("@aws-cdk/aws-codepipeline-actions");
/**
 * Stack to define the awsdevhour-backend application pipeline
 *
 * Prerequisite:
 *  Github personal access token should be stored in Secret Manager with id as below
 *  Github owner value should be set up in System manager - Parameter store with name as below
 *  Github repository value should be set up in System manager - Parameter store with name as below
 *  Github branch value should be set up in System manager - Parameter store with name as below
 * */
class AwsdevhourBackendPipelineStack extends core_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const sourceArtifact = new codepipeline.Artifact();
        const cloudAssemblyArtifact = new codepipeline.Artifact();
        const githubOwner = aws_ssm_1.StringParameter.fromStringParameterAttributes(this, 'gitOwner', {
            parameterName: 'devhour-backend-git-owner'
        }).stringValue;
        const githubRepo = aws_ssm_1.StringParameter.fromStringParameterAttributes(this, 'gitRepo', {
            parameterName: 'devhour-backend-git-repo'
        }).stringValue;
        const githubBranch = aws_ssm_1.StringParameter.fromStringParameterAttributes(this, 'gitBranch', {
            parameterName: 'devhour-backend-git-branch'
        }).stringValue;
        const pipeline = new pipelines_1.CdkPipeline(this, 'Pipeline', {
            crossAccountKeys: false,
            cloudAssemblyArtifact,
            // Define application source
            sourceAction: new codepipeline_actions.GitHubSourceAction({
                actionName: 'GitHub',
                output: sourceArtifact,
                oauthToken: core_1.SecretValue.secretsManager('devhour-backend-git-access-token', { jsonField: 'devhour-backend-git-access-token' }),
                owner: githubOwner,
                repo: githubRepo,
                branch: githubBranch
            }),
            // Define build and synth commands
            synthAction: pipelines_1.SimpleSynthAction.standardNpmSynth({
                sourceArtifact,
                cloudAssemblyArtifact,
                //This build command is to download pillow library, unzip the downloaded file and tidy up.
                //If you already have pillow library downloaded under reklayer/, please just run 'npm run build'
                buildCommand: 'rm ./reklayer/pillow-goes-here.txt && wget https://awsdevhour.s3-accelerate.amazonaws.com/pillow.zip && unzip pillow.zip && mv ./python ./reklayer && rm pillow.zip && npm run build',
                synthCommand: 'npm run cdk synth'
            })
        });
        //Define application stage
        const devStage = pipeline.addApplicationStage(new awsdevhour_backend_pipeline_stage_1.AwsdevhourBackendPipelineStage(this, 'dev'));
        devStage.addActions(new aws_codepipeline_actions_1.ManualApprovalAction({
            actionName: 'ManualApproval',
            runOrder: devStage.nextSequentialRunOrder(),
        }));
    }
}
exports.AwsdevhourBackendPipelineStack = AwsdevhourBackendPipelineStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXdzZGV2aG91ci1iYWNrZW5kLXBpcGVsaW5lLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXdzZGV2aG91ci1iYWNrZW5kLXBpcGVsaW5lLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDBEQUEyRDtBQUMzRCwwRUFBMEU7QUFDMUUsd0NBQTBFO0FBQzFFLGtEQUFvRTtBQUNwRSwyRkFBcUY7QUFDckYsOENBQW1EO0FBQ25ELGdGQUF5RTtBQUV6RTs7Ozs7Ozs7S0FRSztBQUVMLE1BQWEsOEJBQStCLFNBQVEsWUFBSztJQUN2RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWtCO1FBQzFELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sY0FBYyxHQUFHLElBQUksWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ25ELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFMUQsTUFBTSxXQUFXLEdBQUcseUJBQWUsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFDO1lBQ2pGLGFBQWEsRUFBRSwyQkFBMkI7U0FDM0MsQ0FBQyxDQUFDLFdBQVcsQ0FBQztRQUVmLE1BQU0sVUFBVSxHQUFHLHlCQUFlLENBQUMsNkJBQTZCLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBQztZQUMvRSxhQUFhLEVBQUUsMEJBQTBCO1NBQzFDLENBQUMsQ0FBQyxXQUFXLENBQUM7UUFFZixNQUFNLFlBQVksR0FBRyx5QkFBZSxDQUFDLDZCQUE2QixDQUFDLElBQUksRUFBRSxXQUFXLEVBQUM7WUFDbkYsYUFBYSxFQUFFLDRCQUE0QjtTQUM1QyxDQUFDLENBQUMsV0FBVyxDQUFDO1FBRWYsTUFBTSxRQUFRLEdBQUcsSUFBSSx1QkFBVyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDakQsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixxQkFBcUI7WUFDckIsNEJBQTRCO1lBQzVCLFlBQVksRUFBRSxJQUFJLG9CQUFvQixDQUFDLGtCQUFrQixDQUFDO2dCQUN4RCxVQUFVLEVBQUUsUUFBUTtnQkFDcEIsTUFBTSxFQUFFLGNBQWM7Z0JBQ3RCLFVBQVUsRUFBRSxrQkFBVyxDQUFDLGNBQWMsQ0FBQyxrQ0FBa0MsRUFBRSxFQUFDLFNBQVMsRUFBRSxrQ0FBa0MsRUFBQyxDQUFDO2dCQUMzSCxLQUFLLEVBQUUsV0FBVztnQkFDbEIsSUFBSSxFQUFFLFVBQVU7Z0JBQ2hCLE1BQU0sRUFBRSxZQUFZO2FBQ3JCLENBQUM7WUFDRixrQ0FBa0M7WUFDbEMsV0FBVyxFQUFFLDZCQUFpQixDQUFDLGdCQUFnQixDQUFDO2dCQUM5QyxjQUFjO2dCQUNkLHFCQUFxQjtnQkFDckIsMEZBQTBGO2dCQUMxRixnR0FBZ0c7Z0JBQ2hHLFlBQVksRUFBRSxzTEFBc0w7Z0JBQ3BNLFlBQVksRUFBRSxtQkFBbUI7YUFDbEMsQ0FBQztTQUNILENBQUMsQ0FBQztRQUVILDBCQUEwQjtRQUMxQixNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsbUJBQW1CLENBQUMsSUFBSSxrRUFBOEIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUUvRixRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksK0NBQW9CLENBQUM7WUFDM0MsVUFBVSxFQUFFLGdCQUFnQjtZQUM1QixRQUFRLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFO1NBQzVDLENBQUMsQ0FBQyxDQUFDO0lBRU4sQ0FBQztDQUNGO0FBbkRELHdFQW1EQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAgKiBhcyBjb2RlcGlwZWxpbmUgZnJvbSAnQGF3cy1jZGsvYXdzLWNvZGVwaXBlbGluZSc7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmVfYWN0aW9ucyBmcm9tICdAYXdzLWNkay9hd3MtY29kZXBpcGVsaW5lLWFjdGlvbnMnO1xuaW1wb3J0IHsgQ29uc3RydWN0LCBTZWNyZXRWYWx1ZSwgU3RhY2ssIFN0YWNrUHJvcHMgfSBmcm9tICdAYXdzLWNkay9jb3JlJztcbmltcG9ydCB7IENka1BpcGVsaW5lLCBTaW1wbGVTeW50aEFjdGlvbiB9IGZyb20gXCJAYXdzLWNkay9waXBlbGluZXNcIjtcbmltcG9ydCB7IEF3c2RldmhvdXJCYWNrZW5kUGlwZWxpbmVTdGFnZSB9IGZyb20gXCIuL2F3c2RldmhvdXItYmFja2VuZC1waXBlbGluZS1zdGFnZVwiO1xuaW1wb3J0IHsgU3RyaW5nUGFyYW1ldGVyIH0gZnJvbSAnQGF3cy1jZGsvYXdzLXNzbSc7XG5pbXBvcnQgeyBNYW51YWxBcHByb3ZhbEFjdGlvbiB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1jb2RlcGlwZWxpbmUtYWN0aW9ucyc7XG5cbi8qKlxuICogU3RhY2sgdG8gZGVmaW5lIHRoZSBhd3NkZXZob3VyLWJhY2tlbmQgYXBwbGljYXRpb24gcGlwZWxpbmVcbiAqXG4gKiBQcmVyZXF1aXNpdGU6XG4gKiAgR2l0aHViIHBlcnNvbmFsIGFjY2VzcyB0b2tlbiBzaG91bGQgYmUgc3RvcmVkIGluIFNlY3JldCBNYW5hZ2VyIHdpdGggaWQgYXMgYmVsb3dcbiAqICBHaXRodWIgb3duZXIgdmFsdWUgc2hvdWxkIGJlIHNldCB1cCBpbiBTeXN0ZW0gbWFuYWdlciAtIFBhcmFtZXRlciBzdG9yZSB3aXRoIG5hbWUgYXMgYmVsb3dcbiAqICBHaXRodWIgcmVwb3NpdG9yeSB2YWx1ZSBzaG91bGQgYmUgc2V0IHVwIGluIFN5c3RlbSBtYW5hZ2VyIC0gUGFyYW1ldGVyIHN0b3JlIHdpdGggbmFtZSBhcyBiZWxvd1xuICogIEdpdGh1YiBicmFuY2ggdmFsdWUgc2hvdWxkIGJlIHNldCB1cCBpbiBTeXN0ZW0gbWFuYWdlciAtIFBhcmFtZXRlciBzdG9yZSB3aXRoIG5hbWUgYXMgYmVsb3dcbiAqICovXG5cbmV4cG9ydCBjbGFzcyBBd3NkZXZob3VyQmFja2VuZFBpcGVsaW5lU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuICBcbiAgICBjb25zdCBzb3VyY2VBcnRpZmFjdCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcbiAgICBjb25zdCBjbG91ZEFzc2VtYmx5QXJ0aWZhY3QgPSBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCk7XG4gIFxuICAgIGNvbnN0IGdpdGh1Yk93bmVyID0gU3RyaW5nUGFyYW1ldGVyLmZyb21TdHJpbmdQYXJhbWV0ZXJBdHRyaWJ1dGVzKHRoaXMsICdnaXRPd25lcicse1xuICAgICAgcGFyYW1ldGVyTmFtZTogJ2RldmhvdXItYmFja2VuZC1naXQtb3duZXInXG4gICAgfSkuc3RyaW5nVmFsdWU7XG4gIFxuICAgIGNvbnN0IGdpdGh1YlJlcG8gPSBTdHJpbmdQYXJhbWV0ZXIuZnJvbVN0cmluZ1BhcmFtZXRlckF0dHJpYnV0ZXModGhpcywgJ2dpdFJlcG8nLHtcbiAgICAgIHBhcmFtZXRlck5hbWU6ICdkZXZob3VyLWJhY2tlbmQtZ2l0LXJlcG8nXG4gICAgfSkuc3RyaW5nVmFsdWU7XG4gIFxuICAgIGNvbnN0IGdpdGh1YkJyYW5jaCA9IFN0cmluZ1BhcmFtZXRlci5mcm9tU3RyaW5nUGFyYW1ldGVyQXR0cmlidXRlcyh0aGlzLCAnZ2l0QnJhbmNoJyx7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiAnZGV2aG91ci1iYWNrZW5kLWdpdC1icmFuY2gnXG4gICAgfSkuc3RyaW5nVmFsdWU7XG4gICAgXG4gICAgY29uc3QgcGlwZWxpbmUgPSBuZXcgQ2RrUGlwZWxpbmUodGhpcywgJ1BpcGVsaW5lJywge1xuICAgICAgY3Jvc3NBY2NvdW50S2V5czogZmFsc2UsXG4gICAgICBjbG91ZEFzc2VtYmx5QXJ0aWZhY3QsXG4gICAgICAvLyBEZWZpbmUgYXBwbGljYXRpb24gc291cmNlXG4gICAgICBzb3VyY2VBY3Rpb246IG5ldyBjb2RlcGlwZWxpbmVfYWN0aW9ucy5HaXRIdWJTb3VyY2VBY3Rpb24oe1xuICAgICAgICBhY3Rpb25OYW1lOiAnR2l0SHViJyxcbiAgICAgICAgb3V0cHV0OiBzb3VyY2VBcnRpZmFjdCxcbiAgICAgICAgb2F1dGhUb2tlbjogU2VjcmV0VmFsdWUuc2VjcmV0c01hbmFnZXIoJ2RldmhvdXItYmFja2VuZC1naXQtYWNjZXNzLXRva2VuJywge2pzb25GaWVsZDogJ2RldmhvdXItYmFja2VuZC1naXQtYWNjZXNzLXRva2VuJ30pLCAvLyB0aGlzIHRva2VuIGlzIHN0b3JlZCBpbiBTZWNyZXQgTWFuYWdlclxuICAgICAgICBvd25lcjogZ2l0aHViT3duZXIsXG4gICAgICAgIHJlcG86IGdpdGh1YlJlcG8sXG4gICAgICAgIGJyYW5jaDogZ2l0aHViQnJhbmNoXG4gICAgICB9KSxcbiAgICAgIC8vIERlZmluZSBidWlsZCBhbmQgc3ludGggY29tbWFuZHNcbiAgICAgIHN5bnRoQWN0aW9uOiBTaW1wbGVTeW50aEFjdGlvbi5zdGFuZGFyZE5wbVN5bnRoKHtcbiAgICAgICAgc291cmNlQXJ0aWZhY3QsXG4gICAgICAgIGNsb3VkQXNzZW1ibHlBcnRpZmFjdCxcbiAgICAgICAgLy9UaGlzIGJ1aWxkIGNvbW1hbmQgaXMgdG8gZG93bmxvYWQgcGlsbG93IGxpYnJhcnksIHVuemlwIHRoZSBkb3dubG9hZGVkIGZpbGUgYW5kIHRpZHkgdXAuXG4gICAgICAgIC8vSWYgeW91IGFscmVhZHkgaGF2ZSBwaWxsb3cgbGlicmFyeSBkb3dubG9hZGVkIHVuZGVyIHJla2xheWVyLywgcGxlYXNlIGp1c3QgcnVuICducG0gcnVuIGJ1aWxkJ1xuICAgICAgICBidWlsZENvbW1hbmQ6ICdybSAuL3Jla2xheWVyL3BpbGxvdy1nb2VzLWhlcmUudHh0ICYmIHdnZXQgaHR0cHM6Ly9hd3NkZXZob3VyLnMzLWFjY2VsZXJhdGUuYW1hem9uYXdzLmNvbS9waWxsb3cuemlwICYmIHVuemlwIHBpbGxvdy56aXAgJiYgbXYgLi9weXRob24gLi9yZWtsYXllciAmJiBybSBwaWxsb3cuemlwICYmIG5wbSBydW4gYnVpbGQnLFxuICAgICAgICBzeW50aENvbW1hbmQ6ICducG0gcnVuIGNkayBzeW50aCdcbiAgICAgIH0pXG4gICAgfSk7XG4gICAgXG4gICAgLy9EZWZpbmUgYXBwbGljYXRpb24gc3RhZ2VcbiAgICBjb25zdCBkZXZTdGFnZSA9IHBpcGVsaW5lLmFkZEFwcGxpY2F0aW9uU3RhZ2UobmV3IEF3c2RldmhvdXJCYWNrZW5kUGlwZWxpbmVTdGFnZSh0aGlzLCAnZGV2JykpO1xuXG4gICAgZGV2U3RhZ2UuYWRkQWN0aW9ucyhuZXcgTWFudWFsQXBwcm92YWxBY3Rpb24oe1xuICAgICAgYWN0aW9uTmFtZTogJ01hbnVhbEFwcHJvdmFsJyxcbiAgICAgIHJ1bk9yZGVyOiBkZXZTdGFnZS5uZXh0U2VxdWVudGlhbFJ1bk9yZGVyKCksXG4gICAgfSkpO1xuXG4gIH1cbn1cbiJdfQ==