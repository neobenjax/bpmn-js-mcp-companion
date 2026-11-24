export const SAMPLE_DIAGRAM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  targetNamespace="http://bpmn.io/schema/bpmn"
  id="Definitions_sample">
  <bpmn:process id="Process_sample" isExecutable="false">
    <bpmn:startEvent id="StartEvent_hungry" name="Hunger noticed">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_choose" name="Choose recipe">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:exclusiveGateway id="Gateway_ingredients" name="Ingredients available?">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_no</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:userTask id="Task_cook" name="Cook meal">
      <bpmn:incoming>Flow_yes</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:serviceTask id="Task_order" name="Order food online">
      <bpmn:incoming>Flow_no</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:exclusiveGateway id="Gateway_merge">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="EndEvent_satisfied" name="Hunger satisfied">
      <bpmn:incoming>Flow_5</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_hungry" targetRef="Task_choose" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_choose" targetRef="Gateway_ingredients" />
    <bpmn:sequenceFlow id="Flow_yes" name="Yes" sourceRef="Gateway_ingredients" targetRef="Task_cook" />
    <bpmn:sequenceFlow id="Flow_no" name="No" sourceRef="Gateway_ingredients" targetRef="Task_order" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_cook" targetRef="Gateway_merge" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_order" targetRef="Gateway_merge" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Gateway_merge" targetRef="EndEvent_satisfied" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_sample">
    <bpmndi:BPMNPlane id="BPMNPlane_sample" bpmnElement="Process_sample">
      <bpmndi:BPMNShape id="Shape_StartEvent_hungry" bpmnElement="StartEvent_hungry">
        <dc:Bounds x="160" y="212" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="140" y="255" width="76" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Task_choose" bpmnElement="Task_choose">
        <dc:Bounds x="250" y="190" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Gateway_ingredients" bpmnElement="Gateway_ingredients" isMarkerVisible="true">
        <dc:Bounds x="405" y="205" width="50" height="50" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="398" y="168" width="64" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Task_cook" bpmnElement="Task_cook">
        <dc:Bounds x="520" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Task_order" bpmnElement="Task_order">
        <dc:Bounds x="520" y="260" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_Gateway_merge" bpmnElement="Gateway_merge" isMarkerVisible="true">
        <dc:Bounds x="685" y="205" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Shape_EndEvent_satisfied" bpmnElement="EndEvent_satisfied">
        <dc:Bounds x="792" y="212" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="770" y="255" width="80" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Edge_Flow_1" bpmnElement="Flow_1">
        <di:waypoint x="196" y="230" />
        <di:waypoint x="250" y="230" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Edge_Flow_2" bpmnElement="Flow_2">
        <di:waypoint x="350" y="230" />
        <di:waypoint x="405" y="230" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Edge_Flow_yes" bpmnElement="Flow_yes">
        <di:waypoint x="430" y="205" />
        <di:waypoint x="430" y="160" />
        <di:waypoint x="520" y="160" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="436" y="143" width="18" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Edge_Flow_no" bpmnElement="Flow_no">
        <di:waypoint x="430" y="255" />
        <di:waypoint x="430" y="300" />
        <di:waypoint x="520" y="300" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="438" y="283" width="15" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Edge_Flow_3" bpmnElement="Flow_3">
        <di:waypoint x="620" y="160" />
        <di:waypoint x="710" y="160" />
        <di:waypoint x="710" y="205" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Edge_Flow_4" bpmnElement="Flow_4">
        <di:waypoint x="620" y="300" />
        <di:waypoint x="710" y="300" />
        <di:waypoint x="710" y="255" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Edge_Flow_5" bpmnElement="Flow_5">
        <di:waypoint x="735" y="230" />
        <di:waypoint x="792" y="230" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
