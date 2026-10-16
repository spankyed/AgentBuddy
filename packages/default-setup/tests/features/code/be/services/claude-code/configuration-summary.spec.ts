import { expect, it } from 'vitest';
import { getClaudeConfigurationSummary } from '#features/code/be/services/claude-code/configuration-summary.ts';
it('returns only model/effort summary and an error count, excluding raw secret-bearing fields',()=>{
 const secret='secret-fixture-sentinel';const summary=getClaudeConfigurationSummary({effective:{model:'sonnet',effortLevel:'high',env:{TOKEN:secret},apiKeyHelper:secret,modelSettings:{'native-model':{effortLevel:'xhigh',private:secret},[secret]:42}},applied:{model:'native-model',effort:'xhigh',private:secret},sources:[{file:secret}],errors:[{message:secret}]});
 expect(summary).toEqual({configuredModel:'sonnet',configuredEffort:'high',perModelEffort:'xhigh',appliedModel:'native-model',appliedEffort:'xhigh',configurationErrorCount:1});expect(JSON.stringify(summary)).not.toContain(secret);
});
it('keeps absent configured and unsupported applied effort distinct from a default',()=>{
 expect(getClaudeConfigurationSummary({effective:{},applied:{model:'native',effort:null}})).toMatchObject({configuredModel:undefined,configuredEffort:undefined,perModelEffort:undefined,appliedEffort:null,configurationErrorCount:0});
});
it('rejects an unsupported native shape without echoing source diagnostics',()=>{
 expect(()=>getClaudeConfigurationSummary({effective:{},applied:{model:3,effort:null},errors:[{message:'secret-fixture-sentinel'}]})).toThrow();
 const invalid=()=>getClaudeConfigurationSummary({effective:{modelSettings:{native:{effortLevel:3},'secret-fixture-sentinel':42}},applied:{model:'native',effort:'high'}});expect(invalid).toThrow();
 try{invalid()}catch(error){expect(String(error)).not.toContain('secret-fixture-sentinel');}
});

it('does not treat inherited dictionary properties as custom model settings',()=>{
 for(const model of ['constructor','toString','__proto__'])expect(getClaudeConfigurationSummary({effective:{modelSettings:{}},applied:{model,effort:null}}).perModelEffort).toBeUndefined();
});
