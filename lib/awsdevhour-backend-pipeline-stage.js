"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsdevhourBackendPipelineStage = void 0;
const core_1 = require("@aws-cdk/core");
const awsdevhour_stack_1 = require("./awsdevhour-stack");
/**
 * Deployable unit of awsdevhour-backend app
 * */
class AwsdevhourBackendPipelineStage extends core_1.Stage {
    constructor(scope, id, props) {
        super(scope, id, props);
        new awsdevhour_stack_1.AwsdevhourStack(this, 'AwsdevhourBackendStack-dev');
    }
}
exports.AwsdevhourBackendPipelineStage = AwsdevhourBackendPipelineStage;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXdzZGV2aG91ci1iYWNrZW5kLXBpcGVsaW5lLXN0YWdlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXdzZGV2aG91ci1iYWNrZW5kLXBpcGVsaW5lLXN0YWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdDQUF3RTtBQUN4RSx5REFBcUQ7QUFFckQ7O0tBRUs7QUFDTCxNQUFhLDhCQUErQixTQUFRLFlBQUs7SUFDdkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQjtRQUMxRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixJQUFJLGtDQUFlLENBQUMsSUFBSSxFQUFFLDRCQUE0QixDQUFDLENBQUM7SUFFMUQsQ0FBQztDQUNGO0FBUEQsd0VBT0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDZm5PdXRwdXQsIENvbnN0cnVjdCwgU3RhZ2UsIFN0YWdlUHJvcHMgfSBmcm9tIFwiQGF3cy1jZGsvY29yZVwiO1xuaW1wb3J0IHsgQXdzZGV2aG91clN0YWNrIH0gZnJvbSBcIi4vYXdzZGV2aG91ci1zdGFja1wiO1xuXG4vKipcbiAqIERlcGxveWFibGUgdW5pdCBvZiBhd3NkZXZob3VyLWJhY2tlbmQgYXBwXG4gKiAqL1xuZXhwb3J0IGNsYXNzIEF3c2RldmhvdXJCYWNrZW5kUGlwZWxpbmVTdGFnZSBleHRlbmRzIFN0YWdlIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBTdGFnZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG4gICAgXG4gICAgbmV3IEF3c2RldmhvdXJTdGFjayh0aGlzLCAnQXdzZGV2aG91ckJhY2tlbmRTdGFjay1kZXYnKTtcbiAgICBcbiAgfVxufVxuIl19