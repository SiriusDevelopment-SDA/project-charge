import {
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
  } from "class-validator";
  import { Injectable } from "@nestjs/common";
  import { AppServiceTemplate } from "../templates/app.service.templates";
  
  @ValidatorConstraint({ async: true })
  @Injectable()
  export class TemplateVarsValidator
    implements ValidatorConstraintInterface
  {
    constructor(private readonly templateService: AppServiceTemplate) {}
  
    async validate(value: any, args: ValidationArguments) {
      const dto = args.object as any;
  
      if (!dto.templateId) return false;
  
      const template = await this.templateService.getTemplateOrFail(dto.templateId);
      if (!template) return false;
  
      const requiredVars: Record<string, string> = template.variables;
      if (!value || typeof value !== "object") return false;
  
      for (const key of Object.values(requiredVars)) {
        if (!value[key] || value[key].trim() === "") {
          return false;
        }
      }
  
      return true;
    }
  
    defaultMessage() {
      return "Variáveis do template não estão preenchidas corretamente.";
    }
  }