"use strict";

import * as vscode from 'vscode';

import { Project, Group } from "../models";
import { ADD_NEW_PROJECT_TO_FRONT, PROJECTS_KEY } from "../constants";
import BaseService from './baseService';
import ColorService from './colorService';
import { exec } from "child_process";
import fetch from 'node-fetch';

export default class ProjectService extends BaseService {

    colorService: ColorService;

    constructor(context: vscode.ExtensionContext, colorService: ColorService) {
        super(context);
        this.colorService = colorService;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ GET ~~~~~~~~~~~~~~~~~~~~~~~~~
    getGroups(noSanitize = false): Group[] {
        var groups = this.useSettingsStorage() ?
            this.getProjectsFromSettings() :
            this.getProjectsFromGlobalState();

        if (!noSanitize) {
            groups = this.sanitizeGroups(groups);
        }

        return groups;
    }

    getGroup(groupId: string): Group {
        var groups = this.getGroups();
        return groups.find(g => g.id === groupId) || null;
    }

    getProjectsFlat(): Project[] {
        var groups = this.getGroups();
        var projects = [];
        for (let group of groups) {
            projects.push.apply(projects, group.projects);
        }

        return projects;
    }

    getProject(projectId: string): Project {
        var [project] = this.getProjectAndGroup(projectId);
        return project;
    }

    getProjectAndGroup(projectId: string): [Project, Group] {
        if (projectId == null) {
            return null;
        }

        var groups = this.getGroups();
        for (let group of groups) {
            let project = group.projects.find(p => p.id === projectId);
            if (project != null) {
                return [project, group];
            }
        }
        return [null, null];
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ ADD ~~~~~~~~~~~~~~~~~~~~~~~~~
    async addGroup(groupName: string, projects: Project[] = null): Promise<Group> {
        var groups = this.getGroups();
        if (groups == null) {
            groups = [];
        }

        let newGroup = new Group(groupName, projects);
        groups.push(newGroup);
        await this.saveGroups(groups);
        return newGroup;
    }

    async addProject(project: Project, groupId: string): Promise<Group[]> {
        // Get groups, default them to [] if there are no groups
        var groups = this.getGroups(true);
        if (groups == null) {
            groups = [];
        }

        // Get the group if there is any
        var group = groups.find(g => g.id === groupId);

        if (group == null) {
            if (groups.length) {
                // No group found, but there are groups? Default to first group
                group = groups[0];
            } else {
                // No groups, create initial group
                group = new Group(null);
                groups.push(group);
            }
        }

        if (ADD_NEW_PROJECT_TO_FRONT) {
            group.projects.unshift(project);
        } else {
            group.projects.push(project);
        }

        // Add to recent colors
        try {
            await this.colorService.addRecentColor(project.color);
        } catch (e) {
            console.error(e);
        }

        await this.saveGroups(groups);
		fetch('http://127.0.0.1:8080/project',{method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({name:project.name, jar_paths:project.path})}).then(res => res.json()).then(
			json => {
				console.log(JSON.stringify(json))
			}
		); 
        
        fetch('http://127.0.0.1:8080/project/current', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: project.name})
        }).then(res => res.json()).then(
            json => {
                //vscode.window.showInformationMessage(JSON.stringify(json))
                console.log(JSON.stringify(json));
            }
        );   
        vscode.window.showInformationMessage('添加项目成功')       
        return groups;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ UPDATE ~~~~~~~~~~~~~~~~~~~~~~~~~
    async updateProject(projectId: string, updatedProject: Project) {
        if (!projectId || updatedProject == null) {
            return;
        }

        var groups = this.getGroups();
        for (let group of groups) {
            let project = group.projects.find(p => p.id === projectId);
            if (project != null) {
                Object.assign(project, updatedProject, { id: projectId });
                break;
            }
        }


        // Add to recent colors
        try {
            await this.colorService.addRecentColor(updatedProject.color);
        } catch (e) {
            console.error(e);
        }
        await this.saveGroups(groups);
    }

    async updateGroup(groupId: string, updatedGroup: Group) {
        if (!groupId || updatedGroup == null) {
            return;
        }

        var groups = this.getGroups();
        var group = groups.find(g => g.id === groupId);
        if (group != null) {
            Object.assign(group, updatedGroup, { id: groupId });
        }

        await this.saveGroups(groups);
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ REMOVE ~~~~~~~~~~~~~~~~~~~~~~~~~
    async removeProject(projectId: string): Promise<Group[]> {
        let groups = this.getGroups();
        for (let i = 0; i < groups.length; i++) {
            let group = groups[i];
            let index = group.projects.findIndex(p => p.id === projectId);

            if (index !== -1) {
                group.projects.splice(index, 1);
                break;
            }
        }
        await this.saveGroups(groups);
        return groups;
    }

    async analysisProject(projectId: string) {
        var project = this.getProject(projectId);
        if (project == null) {
            return;
        }
        
/*
        const callgraph_path = vscode.extensions.getExtension('xylab.vscode-callgraph').extensionPath + '/server/start_callgraph.bat';
        const callgraph_command = callgraph_path;
        const cp_callgraph=exec(callgraph_command, (err,stdout,stderr) => {
            console.log(err||stdout||stderr);
        })
        cp_callgraph.on("close",(code,singal)=>{
            console.log(code===0?vscode.window.showInformationMessage('启动callgrap服务成功'):
            vscode.window.showInformationMessage('启动callgrap服务失败'));
        })        
*/
        const java_decompiled_path = vscode.extensions.getExtension('xylab.decompiled').extensionPath + '/jd-cli-1.2.1/jd-cli.bat';
        const decompiled_command = java_decompiled_path + ' ' + project.path;
        const cp=exec(decompiled_command, (err,stdout,stderr) => {
            console.log(err||stdout||stderr);
        })
        cp.on("close",(code,singal)=>{
            console.log(code===0?vscode.window.showInformationMessage('反编译完成'):
            vscode.window.showInformationMessage('反编译失败'));
        })

		fetch('http://127.0.0.1:8080/project/analysis',{method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({name:project.name})}).then(res => res.json()).then(
			json => {
                 vscode.window.showInformationMessage('分析完成')
				console.log(JSON.stringify(json))
			}
		);        
    }    

    async setCurrentProject(projectId: string) {
        var project = this.getProject(projectId);
        if (project == null) {
            return;
        }
        fetch('http://127.0.0.1:8080/project/current', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: project.name })
        }).then(res => res.json()).then(
            json => {
                vscode.window.showInformationMessage(JSON.stringify(json))
            }
        );        
    }       

    

    async removeGroup(groupId: string, testIfEmpty: boolean = false): Promise<Group[]> {
        let groups = this.getGroups();

        groups = groups.filter(g => g.id !== groupId || (testIfEmpty && g.projects.length));
        await this.saveGroups(groups);

        return groups;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ SAVE ~~~~~~~~~~~~~~~~~~~~~~~~~
    saveGroups(groups: Group[]): Thenable<void> {
        groups = this.sanitizeGroups(groups);

        return this.useSettingsStorage() ?
            this.saveGroupsInSettings(groups) :
            this.saveGroupsInGlobalState(groups);
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ STORAGE ~~~~~~~~~~~~~~~~~~~~~~~~~
    private getProjectsFromGlobalState(unsafe: boolean = false): Group[] {
        var groups = this.context.globalState.get(PROJECTS_KEY) as Group[];

        if (groups == null && !unsafe) {
            groups = [];
        }

        return groups;
    }

    private getProjectsFromSettings(unsafe: boolean = false): Group[] {
        var groups = this.configurationSection.get('projectData') as Group[];

        if (groups == null && !unsafe) {
            groups = [];
        }

        return groups;
    }

    private saveGroupsInGlobalState(groups: Group[]): Thenable<void> {
        return this.context.globalState.update(PROJECTS_KEY, groups);
    }

    private saveGroupsInSettings(groups: Group[]): Thenable<void> {
        return this.configurationSection.update("projectData", groups, vscode.ConfigurationTarget.Global);
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ MODEL MIGRATION ~~~~~~~~~~~~~~~~~~~~~~~~~
    async migrateDataIfNeeded() {
        var toMigrate = false;

        var projectsInSettings = this.getProjectsFromSettings(true);
        var projectsInGlobalState = this.getProjectsFromGlobalState(true);

        if (this.useSettingsStorage()) {
            // Migrate from Global State to Settings
            toMigrate = projectsInSettings == null && projectsInGlobalState != null;

            if (toMigrate) {
                await this.saveGroupsInSettings(projectsInGlobalState);
            }

            await this.saveGroupsInGlobalState(null);
        } else {
            // Migrate from Settings To Global State
            toMigrate = projectsInGlobalState == null && projectsInSettings != null;

            if (toMigrate) {
                await this.saveGroupsInGlobalState(projectsInSettings);
            }

            await this.saveGroupsInSettings(null);
        }

        return toMigrate;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ HELPERS ~~~~~~~~~~~~~~~~~~~~~~~~~

    private sanitizeGroups(groups: Group[]): Group[] {
        groups = Array.isArray(groups) ? groups.filter(g => !!g) : [];

        // Fill id, should only happen if user removes id manually. But better be safe than sorry.
        for (let g of groups) {
            if (!g.id) {
                g.id = Group.getRandomId();
            }
        }

        return groups;
    }
}