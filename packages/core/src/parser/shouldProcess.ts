export function shouldProcess(line: string): boolean {
  if (line.length === 0 || line.includes('System.Type.equals')) {
    return false;
  }

  return (
    line.includes('LIMIT_USAGE') ||
    line.includes('SOQL_EXECUTE_BEGIN') ||
    line.includes('SOQL_EXECUTE_EXPLAIN') ||
    line.includes('SOQL_EXECUTE_END') ||
    line.includes('DML_BEGIN') ||
    line.includes('DML_END') ||
    line.includes('USER_INFO') ||
    line.includes('EXECUTION_STARTED') ||
    line.includes('CODE_UNIT_STARTED') ||
    line.includes('CODE_UNIT_FINISHED') ||
    line.includes('METHOD_ENTRY') ||
    line.includes('METHOD_EXIT') ||
    line.includes('FLOW_START_INTERVIEW_BEGIN') ||
    line.includes('FLOW_START_INTERVIEW_END') ||
    line.includes('WF_CRITERIA_BEGIN') ||
    line.includes('WF_CRITERIA_END') ||
    line.includes('WF_RULE_EVAL_BEGIN') ||
    line.includes('WF_RULE_EVAL_END') ||
    line.includes('WF_RULE_NOT_EVALUATED') ||
    line.includes('FLOW_CREATE_INTERVIEW_END') ||
    line.includes('FLOW_INTERVIEW_FINISHED') ||
    line.includes('FLOW_ELEMENT_BEGIN') ||
    line.includes('FLOW_ELEMENT_END') ||
    line.includes('FLOW_BULK_ELEMENT_BEGIN') ||
    line.includes('FLOW_BULK_ELEMENT_END') ||
    line.includes('Number of') ||
    line.includes('Maximum ')
  );
}
