import type { Abi, AbiFunction, AbiParameter } from "viem";

export type UiControlType =
  | "text" | "textarea" | "number-bigint" | "address" | "bool" | "bytes";

export interface UiField {
  name: string;
  solidityType: string;
  control: UiControlType;
  validation: { required: true } & Record<string, unknown>;
}

export interface UiFunctionSpec {
  name: string;
  kind: "read" | "write" | "payable";
  fields: UiField[];
  outputs: { name: string; solidityType: string }[];
}

export function buildUiSchema(abi: Abi): UiFunctionSpec[] {
  return (abi.filter((item) => item.type === "function") as AbiFunction[]).map((fn) => ({
    name: fn.name,
    kind: fn.stateMutability === "view" || fn.stateMutability === "pure"
      ? "read"
      : fn.stateMutability === "payable" ? "payable" : "write",
    fields: fn.inputs.map(mapParamToField),
    outputs: fn.outputs.map((o) => ({ name: o.name || "value", solidityType: o.type })),
  }));
}

function mapParamToField(param: AbiParameter): UiField {
  const t = param.type || "string";
  if (t === "address") {
    return { name: param.name || "address", solidityType: t, control: "address", validation: { required: true, isAddress: true } };
  }
  if (t === "bool") {
    return { name: param.name || "flag", solidityType: t, control: "bool", validation: { required: true } };
  }
  if (t.startsWith("uint") || t.startsWith("int")) {
    return { name: param.name || "amount", solidityType: t, control: "number-bigint", validation: { required: true, min: t.startsWith("uint") ? "0" : undefined } };
  }
  if (t.startsWith("bytes")) {
    return { name: param.name || "data", solidityType: t, control: "bytes", validation: { required: true, hexPattern: t === "bytes" ? "^0x([0-9a-fA-F]{2})*$" : `^0x[0-9a-fA-F]{${(Number(t.replace("bytes","")) || 32) * 2}}$` } };
  }
  // string, tuple, arrays fall back to a validated textarea + JSON.parse for tuples/arrays
  return { name: param.name || "value", solidityType: t, control: t === "string" ? "text" : "textarea", validation: { required: true } };
}
