/* This module handles the tools to edit the scene */

var EditorModule = { 
	name: "editor",
	icons_path:  "imgs/",

	//to call when editing a node
	node_editors: [],
	material_editors: {},

	selected_data: null, //the extra info about this item selected (which component, which field, etc)

	settings_panel: [ {name:"editor", title:"Editor", icon:null } ],
	settings: { //persistent settings
		autoselect: false,
		autofocus: true,
		save_on_exit: false,
		reload_on_start: true
	},

	commands: {},

	init: function()
	{
		RenderModule.canvas_manager.addWidget(this);

		if(!gl) 
			return;

		this.createMenuEntries();

		var scene = LS.GlobalScene;

		LEvent.bind( scene, "scene_loaded", function(e) { 
			EditorModule.inspect( scene.root );
		});

		LEvent.bind( scene, "node_clicked", function(e, node) { 
			EditorModule.inspect( node );
		});
		

		SelectionModule.setSelection( scene.root );

		document.addEventListener("keydown", this.globalKeyDown.bind(this), false );

		var scene = localStorage.getItem("_refresh_scene");
		if(scene)
			setTimeout(function(){ 
				SceneStorageModule.setSceneFromJSON(scene); 
				localStorage.removeItem("_refresh_scene");
			},1000);
		else
		{
			//set default scene
			LS.GlobalScene.root.addComponent( new LS.Components.Skybox() );
		}

		EditorModule.refreshAttributes();

		this.registerCommands();
	},

	registerCommands: function()
	{
		this.commands["set"] = this.setPropertyValueToSelectedNode.bind(this);
		this.commands["create"] = function( cmd, tokens )
		{
			var that = EditorModule;
			switch(tokens[1])
			{
				case "node": that.createNullNode(); break;
				case "light": that.createLightNode(); break;
				case "plane": that.createPrimitive({ geometry: LS.Components.GeometricPrimitive.PLANE, size: 10, xz: true, subdivisions: 2 },"plane"); break;
				case "cube": that.createPrimitive({ geometry: LS.Components.GeometricPrimitive.CUBE, size: 10, subdivisions: 10 },"cube"); break;
				case "sphere": that.createPrimitive({ geometry: LS.Components.GeometricPrimitive.SPHERE, size: 10, subdivisions: 32 },"sphere"); break;
				default: break;
			}
		}
		this.commands["addComponent"] = function( cmd, tokens) { 
			EditorModule.addComponentToNode( SelectionModule.getSelectedNode(), tokens[1] );
			EditorModule.inspect( LS.GlobalScene.selected_node );
		};
		this.commands["selectNode"] = function( cmd, tokens) { 
			var node = LS.GlobalScene.getNode( tokens[1] );
			SelectionModule.setSelection( node );
		};
		this.commands["lights"] = function( cmd, tokens) { 
			var lights = LS.GlobalScene._lights;
			if(!lights)
				return;
			EditorModule.inspectObjects( lights );
		};
		this.commands["cameras"] = function( cmd, tokens) { 
			var cameras = RenderModule.cameras;
			if(!cameras)
				return;
			EditorModule.inspectObjects(cameras);
		};
		this.commands["components"] = function(cmd, tokens) { 
			var components = LS.GlobalScene.findNodeComponents( tokens[1] );
			if(!components)
				return;
			if(!components.length)
				return;
			EditorModule.inspectObjects( components );
		};
		this.commands["focus"] = function() {
			EditorModule.focusCameraInSelection();
		};
		this.commands["frame"] = function() {
			EditorModule.focusCameraInAll();
		};
	},

	createMenuEntries: function()
	{
		var mainmenu = LiteGUI.menubar;
		//buttons

		mainmenu.add("Scene/Settings", { callback: function() { 
			EditorModule.inspect( LS.GlobalScene ); 
		}});

		mainmenu.separator("Edit");

		mainmenu.add("Edit/Copy Node", { callback: function() { EditorModule.copyNodeToClipboard( SelectionModule.getSelectedNode() ); }});
		mainmenu.add("Edit/Paste Node", { callback: function() { EditorModule.pasteNodeFromClipboard(); }});
		mainmenu.add("Edit/Clone Node", { callback: function() { EditorModule.cloneNode( SelectionModule.getSelectedNode() ); }});
		mainmenu.add("Edit/Delete Node", { callback: function() { EditorModule.removeSelectedNodes(); }});
		mainmenu.add("Edit/Focus on node", { callback: function() { cameraTool.setFocusPointOnNode( SelectionModule.getSelectedNode(), true ); }});
		mainmenu.add("Edit/Paste component", { callback: function() { EditorModule.pasteComponentInNode( SelectionModule.getSelectedNode() ); }});

		mainmenu.add("Node/Create node", { callback: function() { EditorModule.createNullNode(); }});
		mainmenu.add("Node/Create camera", { callback: function() { EditorModule.createCameraNode(); }});
		mainmenu.add("Node/Create light", { callback: function() { EditorModule.createLightNode(); }} );
		//mainmenu.separator("Node");
		mainmenu.add("Node/Primitive/Plane", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.PLANE, size: 10, subdivisions: 10, align_z: true}); }});
		mainmenu.add("Node/Primitive/Plane Y", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.PLANE, size: 10, subdivisions: 10, align_z: false}); }});
		mainmenu.add("Node/Primitive/Cube", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.CUBE, size: 10, subdivisions: 10 }); }});
		mainmenu.add("Node/Primitive/Sphere", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.SPHERE, size: 10, subdivisions: 32 }); }});
		mainmenu.add("Node/Primitive/Hemisphere", { callback: function() { EditorModule.createPrimitive( { geometry: LS.Components.GeometricPrimitive.HEMISPHERE, size: 10, subdivisions: 32 }); }});
		mainmenu.add("Node/Templates/Sprite", { callback: function() { EditorModule.createTemplate("Sprite",[{ component: "Sprite" }]); }});
		mainmenu.add("Node/Templates/ParticleEmissor", { callback: function() { EditorModule.createTemplate("Particles",[{ component: "ParticleEmissor" }]); }});
		mainmenu.add("Node/Templates/MeshRenderer", { callback: function() { EditorModule.createTemplate("Mesh",[{ component: "MeshRenderer" }]); }});

		mainmenu.add("Node/Add Component", { callback: function() { EditorModule.showAddComponentToNode(null, function(){ EditorModule.refreshAttributes(); } ); }} );
		mainmenu.add("Node/Add Material", { callback: function() { EditorModule.showAddMaterialToNode( null, function(){ EditorModule.refreshAttributes(); }); }} );
		mainmenu.add("Node/Add Script", { callback: function() { 
			CodingModule.onNewScript(); 
			EditorModule.refreshAttributes();
		}});
		mainmenu.add("Node/Check JSON", { callback: function() { EditorModule.checkJSON( SelectionModule.getSelectedNode() ); }} );

		//mainmenu.add("View/Default material properties", { callback: function() { EditorModule.inspectInDialog( LS.Renderer.default_material ); }});
		mainmenu.add("View/Layers", { callback: function() { EditorModule.showLayersEditor(); }});

		mainmenu.add("Actions/Reload Shaders", { callback: function() { 
			LS.ShadersManager.reloadShaders(function() { RenderModule.requestFrame(); }); 
		}});

		//mainmenu.separator("Project", 100);
		//mainmenu.add("Project/Reset", { order: 101, callback: this.showResetDialog.bind(this) });

		function inner_change_renderMode(v) { RenderModule.setRenderMode(v.value); }
		function inner_is_renderMode(v) { 
			return (RenderModule.render_mode == v.value);
		}
		function inner_is_systemMode(v) { 
			return (EditorModule.coordinates_system == v.value);
		}

		mainmenu.add("View/Show All Gizmos", {  instance: EditorModule.settings, property: "render_all_gizmos", type:"checkbox" });

		mainmenu.add("View/Render Settings", { callback: function() { EditorModule.showRenderSettingsDialog( RenderModule.render_settings) }} );

		mainmenu.add("View/Render Mode/Wireframe", {  value: "wireframe", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Flat", {  value: "flat", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Solid", { value: "solid", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Texture", { value: "texture", isChecked: inner_is_renderMode, callback: inner_change_renderMode });
		mainmenu.add("View/Render Mode/Full", { value: "full", isChecked: inner_is_renderMode, callback: inner_change_renderMode });



		/*
		mainmenu.add("Edit/Coordinates/Object", { value: "object", isChecked: inner_is_systemMode, callback: function() { EditorModule.coordinates_system = 'object'; RenderModule.requestFrame(); }});
		mainmenu.add("Edit/Coordinates/World", { value: "world", isChecked: inner_is_systemMode, callback: function() { EditorModule.coordinates_system = 'world'; RenderModule.requestFrame(); }});
		mainmenu.add("Edit/Coordinates/View", { value: "view", isChecked: inner_is_systemMode, callback: function() { EditorModule.coordinates_system = 'view'; RenderModule.requestFrame(); }});
		*/
	},

	registerNodeEditor: function(callback)
	{
		this.node_editors.push(callback);
	},

	registerMaterialEditor: function(classname, callback)
	{
		this.material_editors[classname] = callback;
	},

	refreshAttributes: function()
	{
		if(!this.inspector.instance)
			return;
		this.inspect(this.inspector.instance);
	},

	updateInspector: function( object )
	{
		this.inspector.update( object );
	},

	inspect: function( objects, inspector )
	{
		if(inspector)
		{
			if(inspector.constructor === InspectorWidget)
				return inspector.inspect( objects );
			if(inspector.inspector_widget)
				return inspector.inspector_widget.inspect( objects );
		}
		else
			return this.inspector.inspect( objects );
	},

	inspectObjects: function( objects, inspector )
	{
		console.warn("Deprecated, use EditorModule.inspect() instead");
		return this.inspect( objects, inspector );
	},

	inspectObject: function(object, inspector)
	{
		console.warn("Deprecated, use EditorModule.inspect() instead");
		return this.inspect( object, inspector );
	},

	inspectScene: function(scene, inspector)
	{
		console.warn("Deprecated, use EditorModule.inspect() instead");
		return this.inspect( scene, inspector );
	},

	inspectNode: function(node, inspector)
	{
		console.warn("Deprecated, use EditorModule.inspect() instead");
		return this.inspect( node, inspector );
	},

	inspectInDialog: function( object )
	{
		if(!object)
			return;

		var classname = LS.getObjectClassName(object);
		var title = classname;

		var uid = object.uid || object.name;
		var id = "dialog_inspector_" + uid;
		var dialog = document.getElementById( "dialog_inspector_" + id );
		if(dialog) //already open
		{
			//bring to front?
			return;
		}

		var height = ($("#visor").height() * 0.8)|0;

		var dialog = new LiteGUI.Dialog(id, {title: title, close: true, minimize: true, width: 300, height: height, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');
		dialog.setPosition(50 + (Math.random() * 10)|0,50 + (Math.random() * 10)|0);
		dialog.on_close = function()
		{
		}

		var inspector_widget = new InspectorWidget();
		var inspector = inspector_widget.inspector;
		inspector_widget.inspector.on_refresh = function()
		{
			inspector_widget.inspect( object );
			dialog.adjustSize();
		}

		inspector_widget.inspector.refresh();
		dialog.add( inspector_widget );
		dialog.adjustSize();
		return dialog;
	},

	getInspectedInstance: function()
	{
		return this.inspector.instance;
	},

	//given a string or object of a JSON, it opens a popup with the code beautified
	checkJSON: function( object )
	{
		if(!object)
			return;

		var w = window.open("",'_blank');

		w.document.write("<style>* { margin: 0; padding: 0; } html,body { margin: 20px; background-color: #222; color: #eee; } </style>");

		if(object.constructor === String)
			object = JSON.parse(object); //transform to object so we can use the propper stringify function
		var data = JSON.stringify( object.serialize ? object.serialize() : object, null, '\t');
		var str = beautifyJSON( data );
		w.document.write("<pre>"+str+"</pre>");
		w.document.close();
	},

	showAddPropertyDialog: function(callback, valid_fields )
	{
		valid_fields = valid_fields || ["string","number","vec2","vec3","vec4","color","texture","node"];

		var uid = Math.random().toString();
		var id = "dialog_inspector_properties";
		var dialog = document.getElementById( "dialog_inspector_" + uid );

		var height = ($("#visor").height() * 0.8)|0;

		var dialog = new LiteGUI.Dialog(id, {title: "Properties", parent:"#visor", close: true, minimize: true, width: 300, height: 200, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');

		var property = { name: "myVar", type: "number", value: 0, step: 0.1 };
		var value_widget = null;

		var inspector = new LiteGUI.Inspector();
		inspector.on_refresh = inner_refresh;
		inner_refresh();

		function inner_refresh()
		{
			inspector.clear();


			inspector.addString("Name", property.name, { callback: function(v){ property.name = v; } });
			inspector.addString("Label", property.label, { callback: function(v){ property.label = v; } });
			inspector.addCombo("Type", property.type, { values: valid_fields, callback: function(v){ 
				property.type = v;
				inspector.refresh();
			}});

			switch(property.type)
			{
				case "number":
					value = 0.0;
					value_widget = inspector.addNumber("Value", value, { callback: function(v){ property.value = v; }});
					break;
				case "vec2":
					value = vec2.fromValues(0,0);
					value_widget = inspector.addVector2("Value", value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; }});
					break;
				case "vec3":
					value = vec3.fromValues(0,0,0);
					value_widget = inspector.addVector3("Value", value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
					break;
				case "vec4":
					value = vec4.fromValues(0,0,0);
					value_widget = inspector.addVector4("Value", value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; property.value[3] = v[3]; }});
					break;
				case "color":
					value = vec3.fromValues(0,0,0);
					value_widget = inspector.addColor("Value", value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
					break;
				default:
					value = "";
					value_widget = inspector.add( property.type, "Value", value, { callback: function(v){ property.value = v; }});
			}
			property.value = value;

			if(property.type == "number" || property.type == "vec2" || property.type == "vec3")
			{
				inspector.addNumber("Step", property.step, { callback: function(v){ property.step = v; }});
			}

			inspector.addButton(null,"Create",{ callback: function() {
				if(callback) callback(property);
				dialog.close();
			}});
		}

		dialog.add( inspector );
		dialog.adjustSize();
	},

	showEditPropertiesDialog: function( properties, valid_fields, callback )
	{
		valid_fields = valid_fields || ["string","number","vec2","vec3","vec4","color","texture"];

		var uid = Math.random().toString();
		var id = "dialog_inspector_properties";
		var dialog = document.getElementById( "dialog_inspector_" + uid );

		var height = ($("#visor").height() * 0.8)|0;

		var dialog = new LiteGUI.Dialog(id, {title: "Properties", parent:"#visor", close: true, minimize: true, width: 300, height: 200, scroll: true, resizable:true, draggable: true});
		dialog.show('fade');
		//dialog.setPosition(50 + (Math.random() * 10)|0,50 + (Math.random() * 10)|0);

		var inspector = new LiteGUI.Inspector();
		var selected = null;
		var value_widget = null;

		inner_update();

		function inner_update()
		{
			var properties_by_name = {};
			for(var i in properties)
			{
				if(!selected)
					selected = properties[i].name;
				properties_by_name[ properties[i].name ] = properties[i];
			}

			inspector.clear();

			//choose which property
			inspector.addCombo("Property", properties_by_name[ selected ], { values: properties_by_name, callback: function(v) { 
				selected = v.name;
				inner_update();
			}});

			var property = properties_by_name[ selected ];
			if(!property)
				return;	

			//choose which property
			inspector.addString("Label", property.label || "", { callback: function(v) { 
				property.label = v;
			}});

			inspector.addCombo("Type", property.type, { values: valid_fields, callback: function(v) {
				var change = false;
				if(v != property.value)
				{
					property.type = v;
					change = true;
				}

				inner_value_widget( property, change );
			}});


			//value_widget = inspector.addNumber("Value", property.value, { step: property.step, callback: function(v){ property.value = v; }});
			inner_value_widget(property);

			if( property.type == "number" )
				inspector.addNumber("Step", property.step, { callback: function(v){ property.step = v; }});

			inspector.addButton(null,"Delete",{ callback: function() {
				for(var i = 0; i < properties.length; ++i)
				{
					if( properties[i] != property )
						continue;
					properties.splice(i,1);
					break;
				}
				EditorModule.refreshAttributes();
				inner_update();
			}});

			inspector.addButton(null,"Save",{ callback: function() {
				if(callback) callback(property);
				dialog.close();
			}});

			dialog.adjustSize();
		}

		function inner_value_widget(property, change)
		{
			var type = property.type;

			if(type == "number")
			{
				if(change) property.value = 0.0;
				inspector.addNumber("Value", property.value, { step: property.step, callback: function(v){ property.value = v; }});
			}
			else if(type == "vec2")
			{
				if(change) property.value = vec2.fromValues(0,0);
				inspector.addVector2("Value", property.value, { step: property.step, callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; }});
			}
			else if(type == "vec3")
			{
				if(change) property.value = vec3.fromValues(0,0,0);
				inspector.addVector3("Value", property.value, { step: property.step, callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
			}
			else if(type == "color")
			{
				if(change) property.value = vec3.fromValues(0,0,0);
				inspector.addColor("Value", property.value, { callback: function(v){ property.value[0] = v[0]; property.value[1] = v[1]; property.value[2] = v[2]; }});
			}
			else
			{
				if(change) property.value = "";
				value_widget = inspector.add(property.type, "Value", property.value, { callback: function(v){ property.value = v; }});
			}
		}

		dialog.content.appendChild(inspector.root);
		dialog.adjustSize();
	},

	showResetDialog: function()
	{
		LiteGUI.confirm("Are you sure?", function(v) {
			if(v)
				EditorModule.resetEditor();
		});
	},	

	showNodeInfo: function( node )
	{
		var dialog = new LiteGUI.Dialog("node_info",{ title:"Node Info", width: 500, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Name", node.name, function(v){ node.name = v; });
		widgets.addString("UID", node.uid, function(v){ node.uid = v; });
		widgets.addCheckbox("Visible", node.visible, function(v){ node.flags.visible = v; });

		var events = {};
		if(node.__levents)
			for(var i in node.__levents)
				events[ i ] = node.__levents[i];
		widgets.addCombo("Binded Events",null,{ values: events, callback: function(v){
			console.log(v);
		}});

		widgets.addSeparator();

		widgets.addButtons(null,["Show JSON","Close"], function(v){
			if(v == "Show JSON")
				EditorModule.checkJSON( node );
			else if(v == "Close")
				dialog.close();
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();
	},

	showLayersEditor: function( layers, callback )
	{
		var scene = LS.GlobalScene;

		var dialog = new LiteGUI.Dialog("layers_editor",{ title:"Layers editor", width: 300, height: 500, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();

		var container = widgets.startContainer();
		container.style.height = "300px";
		container.style.overflow = "auto";

		if(layers !== undefined)
			widgets.widgets_per_row = 2;

		for(var i = 0; i < 32; ++i)
		{
			widgets.addString(null, scene.layer_names[i] || ("layer"+i), { layer: i, width: layers !== undefined ? "80%" : null, callback: function(v) {
				scene.layer_names[ this.options.layer ] = v;
			}});

			if(layers !== undefined)
				widgets.addCheckbox( null, 1<<i & layers, { layer: i, width: "20%", callback: function(v){
					var bit = this.options.layer;
					var f = 1<<bit;
					layers = (layers & (~f));
					if(v)
						layers |= f;
					if(callback)
						callback(layers,bit,v);
				}});
		}

		widgets.widgets_per_row = 1;
		widgets.endContainer();

		widgets.addButtons(null,["Close"], function(v){
			if(v == "Close")
				dialog.close();
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();
		dialog.center();
	},

	showComponentInfo: function( component )
	{
		var dialog = new LiteGUI.Dialog("component_info",{ title:"Component Info", width: 500, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Class", LS.getObjectClassName(component), { disabled: true } );
		if(component.enabled !== undefined)
			widgets.addCheckbox("Enabled", component.enabled, function(v){ component.enabled = v; });
		widgets.addString("UID", component.uid, function(v){ component.uid = v; });
		var locator_widget = widgets.addString("Locator", component.getLocator(), { disabled: true } );
		/*
		locator_widget.style.cursor = "pointer";
		locator_widget.setAttribute("draggable","true");
		locator_widget.addEventListener("dragstart", function(event) { 
			event.dataTransfer.setData("uid", component.uid );
			event.dataTransfer.setData("locator", component.getLocator() );
			event.dataTransfer.setData("type", "Component");
			if(component.root)
				event.dataTransfer.setData("node_uid", component.root.uid);
			event.preventDefault();
		});
		*/

		if( component.onComponentInfo )
			component.onComponentInfo( widgets );

		var events = {};
		if(component.__levents)
			for(var i in component.__levents)
				events[ i ] = component.__levents[i];
		widgets.addCombo("Binded Events",null,{ values: events, callback: function(v){
			console.log(v);
		}});

		widgets.addSeparator();

		widgets.addButtons(null,["Show JSON","Copy Component","Close"], function(v){
			if(v == "Show JSON")
				EditorModule.checkJSON( component );
			else if(v == "Close")
				dialog.close();
			else if(v == "Copy")
				EditorModule.copyComponentToClipboard( component );
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();
	},

	showRenderSettingsDialog: function( render_settings )
	{
		var dialog = new LiteGUI.Dialog(null,{ title:"Render Settings", width: 400, draggable: true, closable: true });
		
		var inspector = new LiteGUI.Inspector(null,{name_width:"50%"});
		inspector.showObjectFields( render_settings );

		inspector.onchange = function(){
			LS.GlobalScene.refresh();
		}

		dialog.add( inspector );
		dialog.adjustSize();
		dialog.show();
	},

	showRenderFrameContextDialog: function( render_context )
	{
		var dialog = new LiteGUI.Dialog(null,{ title:"Render Context", width: 400, draggable: true, closable: true });
		
		var inspector = new LiteGUI.Inspector(null,{name_width:"50%"});
		inspector.showObjectFields( render_context );

		inspector.onchange = function(){
			LS.GlobalScene.refresh();
		}

		dialog.add( inspector );
		dialog.adjustSize();
		dialog.show();
	},

	onDropOnNode: function( node, event )
	{
		if(!node)
			return;

		var item_uid = event.dataTransfer.getData("uid");
		var item_type = event.dataTransfer.getData("type");

		var item = null;
		if(item_type == "SceneNode")
			item = LSQ.get( item_uid );
		else if(item_type == "Component")
			item = LS.GlobalScene.findComponentByUId( item_uid );
		else if(item_type == "Material")
			item = LS.GlobalScene.findMaterialByUId( item_uid );

		if(item && item.constructor == LS.SceneNode && node != item )
		{
			node.addChild( item );		
			console.log("Change parent");
		}

		if(item && item.constructor.is_component)
		{
			var component = item;
			if(node != component.root)
			{
				if(event.shiftKey)
				{
					var new_component = component.clone();
					node.addComponent( new_component );
					console.log("Component cloned");
				}
				else
				{
					component.root.removeComponent( component );
					node.addComponent( component );
					console.log("Component moved");
				}
			}
		}

		if( item && item.constructor.is_material )
		{
			var material = item;
			if(material._root) //belong to one node
			{
				var new_material = material.clone();
				node.material = new_material;
				console.log("Material cloned");
			}
			else
			{
				node.material = material.uid;
				console.log("Material assigned");
			}
		}

		if (item_type == "resource")
		{
			var filename = event.dataTransfer.getData("res-fullpath");
			this.onDropResourceOnNode( filename, node, event );
		}

		if(event.dataTransfer.files && event.dataTransfer.files.length)
		{
			ImporterModule.onItemDrop( event, { node: node });
		}

		RenderModule.requestFrame();
		EditorModule.refreshAttributes();
	},

	onDropResourceOnNode: function( resource_filename, node, event )
	{
		var resource = LS.ResourcesManager.getResource( resource_filename );
		if(!resource)
			LS.ResourcesManager.load( resource_filename, inner );			
		else
			inner( resource );

		function inner( resource )
		{
			if(!resource || !resource.assignToNode)
				return;

			resource.assignToNode( node );
			RenderModule.requestFrame();
			EditorModule.refreshAttributes();
		}
	},

	//Resets all, it should leave the app state as if a reload was done
	resetEditor: function()
	{
		LS.GlobalScene.clear();
		LS.ResourcesManager.reset();
		LEvent.trigger(this,"resetEditor");
	},

	copyNodeToClipboard: function( node )
	{
		if(!node)
			return;

		var data = node.serialize();
		data.uid = null; //remove UID
		data._object_type = LS.getObjectClassName(node);
		LiteGUI.toClipboard( data );
	},

	pasteNodeFromClipboard: function( parent ) {
		var data = LiteGUI.getClipboard();
		if( !data )
			return;
		if(data._object_type != "SceneNode")
			return;

		data.uid = null; //remove UID

		var node = new LS.SceneNode();
		node.configure(data);

		parent = parent || LS.GlobalScene.root;
		parent.addChild(node);

		SelectionModule.setSelection( node );
		EditorModule.inspect( LS.GlobalScene.selected_node); //update interface
		RenderModule.requestFrame();
	},

	copyComponentToClipboard: function(component) {
		UndoModule.saveComponentChangeUndo(component);
		var data = component.serialize();
		data._object_type = LS.getObjectClassName(component);
		data.uid = null; //remove UID
		LiteGUI.toClipboard( data );
	},

	pasteComponentFromClipboard: function(component) {
		UndoModule.saveComponentChangeUndo(component);
		var data = LiteGUI.getClipboard();
		if( !data )
			return;
		data.uid = null; //remove UID
		component.configure( data ); 
		$(component).trigger("changed");
		EditorModule.inspect(LS.GlobalScene.selected_node); //update interface
		RenderModule.requestFrame();
	},

	pasteComponentInNode: function(node)
	{
		UndoModule.saveNodeChangeUndo(node);
		var data = LiteGUI.getClipboard();
		if(!data || !data._object_type)
			return;
		data.uid = null; //remove UID
		var component = new LS.Components[ data._object_type ]();
		node.addComponent(component);
		component.configure(data); 
		EditorModule.inspect(node); //update interface
		RenderModule.requestFrame();
	},	

	resetNodeComponent: function(component) {
		UndoModule.saveComponentChangeUndo(component);
		if(component.reset)
			component.reset();
		else
			component.configure( (new LS.Components[ LS.getObjectClassName(component)]()).serialize() ); 
		LiteGUI.trigger(component, "changed");
		EditorModule.inspect( LS.GlobalScene.selected_node ); //update interface
		RenderModule.requestFrame();
	},

	deleteNodeComponent: function(component) {
		var node = component._root;
		if(!node)
			return;
		UndoModule.saveComponentDeletedUndo( component );

		LEvent.trigger( LS.GlobalScene, "nodeComponentRemoved", component );
		node.removeComponent( component ); 
		EditorModule.inspect( node );
		RenderModule.requestFrame(); 
	},

	deleteNode: function(node) {
		if( !node || !node.parentNode )
			return;
		UndoModule.saveNodeDeletedUndo( node );
		node.parentNode.removeChild( node ); 
		EditorModule.inspect();
		RenderModule.requestFrame(); 
	},

	//************************

	loadAndSetTexture: function (node, attr, name, data)
	{
		if(!data)
		{
			if (LS.ResourcesManager.textures[name])
			{
				node[attr] = name;
				return;
			}
			data = name; //maybe its a url
		}

		var img = new Image();
		img.type = 'IMG';
		img.onload = function(e)
		{
			img.onload = null;
			var tex = LS.ResourcesManager.processImage(name,img);
			node[attr] = name;
		}
		img.src = data;
	},

	cloneNode: function(node, use_same_parent, skip_undo)
	{
		if(!node) return;
		
		var new_node = node.clone();
		//new_node.transform.fromMatrix( node.transform.getGlobalMatrix(), true );
		var parent = use_same_parent ? node.parentNode : LS.GlobalScene.root;
		parent.addChild( new_node );

		if(!skip_undo)
			UndoModule.saveNodeCreatedUndo( new_node );

		return new_node;
	},

	cloneNodeMaterial: function( node, skip_undo )
	{
		var material = node.getMaterial();
		material = material.clone();
		delete material["filename"]; //no name
		delete material["fullpath"]; //no name
		node.material = material;
		if(!skip_undo)
			UndoModule.saveNodeCreatedUndo( node );
	},

	//interaction
	removeSelectedNodes: function()
	{
		SelectionModule.removeSelectedInstances();
	},

	pasteComponent: function(node)
	{

	},

	// returns the root node
	getAddRootNode: function()
	{
		return LS.GlobalScene.root; //Scene.selected_node
	},

	updateCreatedNodePosition: function( node )
	{
		var current_camera = RenderModule.getActiveCamera();
		node.transform.position = current_camera.getCenter();
	},

	setPropertyValueToSelectedNode: function(cmd, tokens)
	{
		var node = SelectionModule.getSelectedNode();
		if(!node)
			return;
		UndoModule.saveNodeChangeUndo( node );
		var value = tokens[2];
		if( !isNaN(value) )
			value = parseFloat(value);
		else if(value == "true" || value == "false")
			value = value == "true";
		else if(value == "null")
			value = null;

		var r = node.setPropertyValue( tokens[1], value );
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
	},

	createGraph: function()
	{
		var compo = new LS.Components.GraphComponent();
		var node = SelectionModule.getSelectedNode() || LS.GlobalScene.root;
		UndoModule.saveNodeChangeUndo( node );
		node.addComponent(compo);
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
		GraphModule.editInstanceGraph( compo,null,true );
	},

	createNullNode: function()
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("node") );
		node.material = null;
		EditorModule.getAddRootNode().addChild( node );
		EditorModule.updateCreatedNodePosition( node );
		UndoModule.saveNodeCreatedUndo( node );
		SelectionModule.setSelection(node);
		return node;
	},

	createNodeWithMesh: function(mesh_name, options)
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("mesh") );
		node.material = new LS.StandardMaterial();
		node.setMesh(mesh_name);
		EditorModule.getAddRootNode().addChild( node );
		EditorModule.updateCreatedNodePosition( node );
		UndoModule.saveNodeCreatedUndo(node);
		SelectionModule.setSelection(node);

		LS.ResourcesManager.load( mesh_name, options );
		return node;
	},

	createCameraNode: function()
	{
		var current_camera = RenderModule.getActiveCamera();

		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("camera") );
		var camera = new LS.Camera( current_camera );
		node.addComponent( camera );
		node.transform.lookAt( current_camera.getEye(), current_camera.getCenter(), current_camera.up );

		camera._eye.set(LS.ZEROS);
		camera._center.set(LS.FRONT);

		camera.focalLength = current_camera.focalLength;

		EditorModule.getAddRootNode().addChild( node );
		EditorModule.updateCreatedNodePosition( node );
		UndoModule.saveNodeCreatedUndo( node );
		SelectionModule.setSelection( node );
		return node;
	},

	createLightNode: function()
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName("light") );
		node.addComponent( new LS.Light() );
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.updateCreatedNodePosition( node );
		UndoModule.saveNodeCreatedUndo(node);
		SelectionModule.setSelection(node);
		return node;
	},

	createPrimitive: function(info, name)
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName(name || "primitive") );
		node.addComponent( new LS.Components.GeometricPrimitive( info ) );
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.updateCreatedNodePosition( node );
		UndoModule.saveNodeCreatedUndo(node);
		SelectionModule.setSelection(node);
		return node;
	},

	createTemplate: function(name, array)
	{
		var node = new LS.SceneNode( LS.GlobalScene.generateUniqueNodeName( name ) );
		for(var i in array)
		{
			var compo_class = array[i].component;
			if(compo_class.constructor === String)
				compo_class = LS.Components[ compo_class ];
			var component = new compo_class( array[i].data );
			node.addComponent( component );
		}
		EditorModule.getAddRootNode().addChild(node);
		EditorModule.updateCreatedNodePosition( node );
		UndoModule.saveNodeCreatedUndo(node);
		SelectionModule.setSelection(node);
		return node;
	},

	addMaterialToNode: function()
	{
		var selected_node = SelectionModule.getSelectedNode();
		if(!selected_node || LS.GlobalScene.selected_node.material )
			return;
		selected_node.material = new LS.StandardMaterial();
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
	},

	addComponentToNode: function( node, component_name )
	{
		if(!node)
			return;
		if(!LS.Components[ component_name ] )
		{
			console.log("No component found with name: ", component_name );
			return;
		}

		node.addComponent( new LS.Components[ component_name ]() );
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
	},

	showCreateResource: function(resource, on_complete, extension )
	{
		extension = extension || "json";

		LiteGUI.prompt("Resource name", inner);

		function inner(name)
		{
			name = name.replace(/ /gi,"_"); //change spaces by underscores
			if(!resource.filename)
			{
				resource.id = null;
				resource.name = name;
				var filename = name;
				if( LS.RM.getExtension( filename ) != extension )
					filename = name + "." + extension;
				resource.filename = filename;
			}

			//save the resource info in resources
			LS.ResourcesManager.registerResource( resource.filename, resource ); 

			if(on_complete)
				on_complete( resource.filename, resource );
		}
	},

	//generic (called from EditorView.mouseup on right click on canvas, which is called from CanvasManager)
	showCanvasContextualMenu: function( instance, event )
	{
		var options = [
			{ title: "View", has_submenu: true },
			{ title: "Create", has_submenu: true }
		];

		var instance_classname = null;

		if(instance)
		{
			options.push(null);
			if( instance.constructor === LS.SceneNode )
			{
				options.push({ title: "Node", has_submenu: true});
			}
			else if( instance.constructor.is_component )
			{
				instance_classname = LS.getObjectClassName(instance);
				options.push({ title: instance_classname, has_submenu: true });
			}
			else
			{
				var actions = null;
				if( instance.getActions )
					actions = instance.getActions();
				else if( instance.constructor.getActions )
					actions = instance.constructor.getActions();

				if(actions)
				{
					options.push(null);
					for(var i in actions)
						options.push( actions[i] );
				}
			}
		}

		var menu = new LiteGUI.ContextualMenu( options, { ignore_item_callbacks: true, event: event, title: "Canvas" , callback: function( action, o, e ) {
			if(action.title == "View")
			{
				var camera = RenderModule.getCameraUnderMouse(e);
				EditorModule.showViewContextualMenu( camera, e, menu );
				return true;
			}

			if(action.title == "Node")
			{
				EditorModule.showNodeContextualMenu( instance, e, menu );
				return true;
			}

			if(action.title == "Create")
			{
				EditorModule.showCreateContextualMenu( instance, e, menu );
				return true;
			}

			if(action.title && action.title == instance_classname)
			{
				EditorModule.showComponentContextualMenu( instance, e, menu );
				return true;
			}

			if(instance)
			{
				if( instance.doAction )
					instance.doAction( action );
				else if( instance.constructor.doAction )
					instance.constructor.doAction( action );
			}
		}});
	},

	//for any instance (node, component, etc)
	showInstanceContextualMenu: function( instance, event )
	{
		if(!instance)
			return;

		var title = null;
		var options = [];

		if( instance.constructor === LS.SceneNode )
			return this.showNodeContextualMenu( instance, event );
		else if( instance.constructor.is_component )
			return this.showComponentContextualMenu( instance, e, menu );
		else
		{
			var actions = null;
			if( instance.getActions )
				actions = instance.getActions();
			else if( instance.constructor.getActions )
				actions = instance.constructor.getActions();

			if(actions)
			{
				options.push(null);
				for(var i in actions)
					options.push( actions[i] );
			}
		}

		if(!options.length)
			return;

		var menu = new LiteGUI.ContextualMenu( options, { title: title, ignore_item_callbacks: true, event: event, callback: function( action, o, e ) {
			if(instance)
			{
				if( instance.doAction )
					instance.doAction( action );
				else if( instance.constructor.doAction )
					instance.constructor.doAction( action );
			}
		}});
	},

	showNodeContextualMenu: function( node, event, prev_menu )
	{
		if(!node || node.constructor !== LS.SceneNode || !node.getActions)
			return;

		var actions = node.getActions();
		if(!actions)
			return;

		var menu = new LiteGUI.ContextualMenu( actions, { ignore_item_callbacks: true, event: event, title:"Node", parentMenu: prev_menu, callback: function(action) {
			node.doAction( action );
		}});
	},

	showComponentContextualMenu: function( component, event, prev_menu )
	{
		if( !component || !component.constructor.is_component )
			return;

		var actions = LS.Component.getActions( component );
		if(!actions)
			return;

		var menu = new LiteGUI.ContextualMenu( actions, { ignore_item_callbacks: true, event: event, parentMenu: prev_menu, title: LS.getObjectClassName( component ), callback: function(action, options, event) {
			LS.Component.doAction( component, action );
		}});
	},

	showViewContextualMenu: function( camera, e, prev_menu )
	{
		if(!camera)
			return;

		var options = [
			"Camera Info",
			"Render Settings",
			null,
			"Perspective",
			"Orthographic",
			null,
			{ title: "Select Camera", has_submenu: true, callback: inner_cameras }
		];

		var menu = new LiteGUI.ContextualMenu( options, { event: e, title: "View", parentMenu: prev_menu, callback: function(v) { 

			switch( v )
			{
				case "Camera Info": EditorModule.inspect( camera ); break;
				case "Render Settings": EditorModule.showRenderSettingsDialog( RenderModule.render_settings ); break;
				case "Perspective": camera.type = LS.Camera.PERSPECTIVE; break;
				case "Orthographic": camera.type = LS.Camera.ORTHOGRAPHIC; break;
				default:
					break;
			}
			LS.GlobalScene.refresh();
		}});

		function inner_cameras( v,o,e ) 
		{
			var options = ["Editor"];
			var scene_cameras = LS.GlobalScene._cameras;
			for(var i = 0; i < scene_cameras.length; i++)
			{
				var scene_camera = scene_cameras[i];
				options.push( { title: "Cam " + scene_camera._root.name, camera: scene_camera } );
			}

			var submenu = new LiteGUI.ContextualMenu( options, { event: e, title: "Cameras", parentMenu: menu, callback: function(v) {
				if(v == "Editor")
				{
					var cam = new LS.Camera();
					cam._viewport.set( camera._viewport );
					RenderModule.setViewportCamera( camera._editor.index, cam );
				}
				else
				{
					RenderModule.setViewportCamera( camera._editor.index, v.camera );
				}
				LS.GlobalScene.refresh();
			}});
		}
	},

	showCreateContextualMenu: function( instance, e, prev_menu )
	{
		var options = ["SceneNode","Light","Camera","Graph"];

		var canvas_event = EditorView._canvas_event || e;
		GL.augmentEvent(canvas_event); //adds canvasx and canvasy
		var position = RenderModule.testGridCollision( canvas_event.canvasx, canvas_event.canvasy );

		var menu = new LiteGUI.ContextualMenu( options, { event: e, title: "Create", parentMenu: prev_menu, callback: function(v) { 
			var node = null;
			if(v == "SceneNode")
				node = EditorModule.createNullNode();
			else if(v == "Light")
				node = EditorModule.createLightNode();
			if(v == "Camera")
				node = EditorModule.createCameraNode();
			if(v == "Graph")
				node = EditorModule.createGraph();

			if(node && position)
				node.transform.position = position;

			LS.GlobalScene.refresh();
		}});
	},

	showAddMaterialToNode: function( node, on_complete )
	{
		node = node || SelectionModule.getSelectedNode();

		if( !node )
		{
			LiteGUI.alert("You must select a node to attach a material");
			return;
		}

		var dialog = new LiteGUI.Dialog("dialog_maetrials", {title:"Materials", close: true, minimize: true, width: 300, height: 230, scroll: false, draggable: true});
		dialog.show('fade');

		var selected = null;
		var list_widget = null;

		var mats = [];
		for(var i in LS.MaterialClasses)
			mats.push( { icon: EditorModule.icons_path + LS.MaterialClasses[i].icon, ctor: LS.MaterialClasses[i], name: LS.getClassName( LS.MaterialClasses[i] ) });

		var filter = "";
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Filter", filter, { callback: function(v) {
			filter = v;
			mats = [];
			for(var i in LS.MaterialClasses)
			{
				var name = LS.getClassName( LS.MaterialClasses[i] );
				if(name.indexOf(filter) != -1)
					mats.push( { icon: EditorModule.icons_path + LS.MaterialClasses[i].icon, ctor: LS.MaterialClasses[i], name: name });
			}
			list_widget.updateItems(mats);
		}});

		list_widget = widgets.addList(null, mats, { height: 140, callback: inner_selected });
		widgets.widgets_per_row = 1;

		widgets.addButton(null,"Add", { className:"big", callback: function()
		{ 
			if(!node || !selected )
			{
				if( on_complete )
					on_complete(null);
				dialog.close();
				return;
			}

			var material = new selected.ctor;
			node.material = material;
			//emit change event?

			dialog.close();
			RenderModule.requestFrame();
			if( on_complete )
				on_complete( material );
		}});

		dialog.add( widgets );
		dialog.adjustSize();

		function inner_selected(value)
		{
			selected = value;
		}
	},

	showAddComponentToNode: function( root_instance, on_complete )
	{
		root_instance = root_instance || this.inspector.instance;

		if( !root_instance || root_instance.constructor != LS.SceneNode )
		{
			LiteGUI.alert("You must select a node to attach a component");
			return;
		}

		var dialog = new LiteGUI.Dialog("dialog_components", {title:"Components", close: true, minimize: true, width: 300, scroll: false, draggable: true});
		dialog.show('fade');

		var selected_component = null;
		var list_widget = null;

		var compos = [];
		for(var i in LS.Components)
			compos.push( { icon: EditorModule.icons_path + LS.Components[i].icon, ctor: LS.Components[i], name: LS.getClassName( LS.Components[i] ) });

		var filter = "";
		var widgets = new LiteGUI.Inspector();
		var filter_widget = widgets.addString("Filter", filter, { focus:true, immediate:true, callback: function(v) {
			filter = v.toLowerCase();
			compos = [];
			for(var i in LS.Components)
			{
				var name = LS.getClassName( LS.Components[i] );
				if(name.toLowerCase().indexOf(filter) != -1)
					compos.push( { icon: EditorModule.icons_path + LS.Components[i].icon, ctor: LS.Components[i], name: name });
			}
			list_widget.updateItems(compos);
		}});

		list_widget = widgets.addList(null, compos, { height: 240, callback: inner_selected });
		widgets.widgets_per_row = 1;

		var icons = list_widget.querySelectorAll(".icon");
		for(var i = 0; i < icons.length; i++)
			icons[i].onerror = function() { this.src = "imgs/mini-icon-question.png"; }


		widgets.addButton(null,"Add", { className:"big", callback: function() { 
			if(!root_instance|| !selected_component)
			{
				dialog.close();
				if(on_complete)
					on_complete();
				return;
			}

			if(!root_instance.addComponent)
				return;

			var compo = new selected_component.ctor;
			root_instance.addComponent( compo );
			UndoModule.saveComponentCreatedUndo( compo );			

			dialog.close();
			if(on_complete)
				on_complete( compo );
			//EditorModule.inspect( root_instance, compo );
			RenderModule.requestFrame();
		}});

		dialog.content.appendChild(widgets.root);

		function inner_selected(value)
		{
			selected_component = value;
		}
	},

	showSelectResource: function( options )
	{
		var dialog = new LiteGUI.Dialog("select-resource-dialog", {title: "Select resource", close: true, width: 800, height: 500, scroll: false, resizable: true, draggable: true});
		var resources_widget = new ResourcesPanelWidget(null,{skip_actions:true});
		if(options.type)
			resources_widget.filterByCategory( options.type );
		resources_widget.showMemoryResources();

		LiteGUI.bind( resources_widget, "resource_selected", inner_selected );
		dialog.add( resources_widget );
		dialog.show();
		return dialog;

		function inner_selected( event )
		{
			var fullpath = event.detail;
			var multiple = options.allow_multiple && event && event.shiftKey; //not used now
			if(!multiple)
				dialog.close();
			if(options.on_complete)
				options.on_complete(fullpath);
			if(fullpath && !options.skip_load)
				LS.ResourcesManager.load( fullpath, null, options.on_load );
			return true;
		}
	},

	//shows a dialog to select a node
	showSelectNode: function(on_complete)
	{
		var dialog = new LiteGUI.Dialog("dialog_nodes", {title:"Scene nodes", close: true, minimize: true, width: 300, height: 310, scroll: false, draggable: true});
		dialog.show( null, this.root );

		/*
		var tree = new SceneTreeWidget();
		dialog.add( tree );
		*/

		var scene = LS.GlobalScene;

		//*
		var selected_value = null;
		var nodes = [];
		for(var i = 0; i < scene._nodes.length; i++ )
		{
			var node = scene._nodes[i];
			nodes.push( { name: node._name, node: node } );
		}

		var widgets = new LiteGUI.Inspector();
		widgets.addList(null, nodes, { height: 140, callback: inner_selected });
		widgets.widgets_per_row = 1;
		widgets.addButton(null,"Select", { className:"big", callback: function() { 
			if(!selected_value)
			{
				dialog.close();
				return;
			}

			dialog.close();
			if(on_complete)
				on_complete( selected_value.node );
			RenderModule.requestFrame();
		}});

		dialog.add( widgets );
		dialog.adjustSize();

		function inner_selected(value)
		{
			selected_value = value;
		}
		//*/
	},

	//shows a dialog to select an existing component
	showSelectComponent: function( selected_component, filter_type, on_complete )
	{
		var dialog = new LiteGUI.Dialog("dialog_component", {title:"Select Component", close: true, minimize: true, width: 400, height: 610, scroll: false, draggable: true});
		dialog.show('fade');

		var area = new LiteGUI.Area();
		dialog.add( area );

		area.split("horizontal",["50%",null]);

		var selected_node = selected_component ? selected_component._root : null;
		var scene = LS.GlobalScene;

		var filter_component = null;
		if(filter_type)
			filter_component = LS.Components[ filter_type ];

		var nodes = [];
		for(var i = 0; i < scene._nodes.length; i++ ) //skip root node
		{
			var node = scene._nodes[i];
			var v = { name: node._name, node: node };
			if( filter_component && !node.getComponent( filter_component ) )
				continue;
			if(node == selected_node)
				v.selected = true;
			nodes.push( v );
		}

		var widgets = new LiteGUI.Inspector();
		widgets.addTitle( "Nodes ");
		widgets.addList( null, nodes, { height: 160, callback: inner_selected_node });
		area.getSection(0).add( widgets );

		var widgets_right = new LiteGUI.Inspector();
		var components_list = [];
		widgets_right.addTitle( "Components");
		var widget_components_list = widgets_right.addList( null, components_list, { height: 140, callback: inner_selected_component });
		widgets_right.addButton(null,"Select", { className:"big", callback: function() { 
			if(!selected_component)
			{
				dialog.close();
				return;
			}
			dialog.close();
			if(on_complete)
				on_complete( selected_component );
			RenderModule.requestFrame();
		}});
		area.getSection(1).add( widgets_right );

		dialog.adjustSize();

		function inner_selected_node(value)
		{
			if(!value)
				return;

			selected_node = value.node;

			var components = selected_node.getComponents();
			components_list = [];
			for(var i = 0; i < components.length; i++)
			{
				var compo = components[i];
				var type = LS.getObjectClassName(compo);
				if(filter_component && filter_component != compo.constructor)
					continue;
				components_list.push( { name: type, uid: compo.uid, component: compo });
			}
			widget_components_list.updateItems( components_list );
		}

		function inner_selected_component(value)
		{
			selected_component = value.component;
		}
	},

	centerCameraInSelection: function()
	{
		var center = SelectionModule.getSelectionCenter();
		center = center || vec3.create();
		cameraTool.setFocusPoint(center);
		RenderModule.requestFrame();
	},

	focusCameraInBoundingBox: function( bbox )
	{
		var radius = BBox.getRadius( bbox );		
		//if(radius == 0)
		//	return;

		var center = BBox.getCenter( bbox );
		cameraTool.setFocusPoint( center, radius * 2 );
		RenderModule.requestFrame();
	},

	focusCameraInSelection: function()
	{
		var node = SelectionModule.getSelectedNode();
		if(!node)
			return;
		var bbox = node.getBoundingBox();
		this.focusCameraInBoundingBox( bbox );
	},

	focusCameraInAll: function()
	{
		var bbox = BBox.create();

		var render_instances = LS.GlobalScene._instances;
		if(render_instances)
			for(var i = 0; i < render_instances.length; ++i)
			{
				if(i == 0)
					bbox.set( render_instances[i].aabb );
				else
					BBox.merge( bbox, bbox, render_instances[i].aabb );
			}

		for(var i = 0; i < LS.GlobalScene._nodes.length; ++i)
		{
			var node = LS.GlobalScene._nodes[i];
			if(!node.transform)
				continue;
			var pos = node.transform.getGlobalPosition();
			BBox.extendToPoint( bbox, pos );
		}

		this.focusCameraInBoundingBox( bbox );
	},

	/* send keydown to current tab */
	globalKeyDown: function(e) {
		var target_element = e.target.nodeName.toLowerCase();
		if(target_element === "input" || target_element === "textarea" || target_element === "select")
			return;

		if(LiteGUI.focus_widget && LiteGUI.focus_widget.onKeyDown)
		{
			var r = LiteGUI.focus_widget.onKeyDown(e);
			if(r)
				return;
		}

		var current_tab = LiteGUI.main_tabs.current_tab[2];
		if(!current_tab) 
			return;
		var module = current_tab.module;
		if(module && module.onKeyDown)
			return module.onKeyDown(e);
	},

	//key actions
	onKeyDown: function(e)
	{
		var keycode = e.keyCode;
		//console.log(keycode);
		switch( keycode )
		{
			case 32:
				if(e.ctrlKey)
					ConsoleModule.toggle();
				break;
			case 83: //S
				if(e.ctrlKey)
				{
					SceneStorageModule.fastSaveScene();
					e.preventDefault();
					e.stopPropagation();
				}
				break;
			case 70: //F
				if(e.shiftKey)
					EditorModule.focusCameraInAll();
				else
					EditorModule.focusCameraInSelection();
				break;
			case 80: //P
				if(e.ctrlKey)
					PlayModule.onPlay();
				e.preventDefault();
				e.stopPropagation();
				return false;
				break;
			case 9: //tab
				InterfaceModule.toggleInspectorTab();
				/*
				e.preventDefault();
				e.stopPropagation();
				return false;
				*/
				break;
			case 8:
			case 46: //delete key only works if the tab is enabled 
				e.preventDefault();
				e.stopPropagation();
				EditorModule.removeSelectedNodes(); 
				return false;
				break;
			case 116: //F5
				if(EditorModule.settings.save_on_exit)
					SceneStorageModule.saveLocalScene("last", {}, LS.GlobalScene, SceneStorageModule.takeScreenshot(256,256) );

				if(EditorModule.settings.save_on_exit && EditorModule.settings.reload_on_start)
				{
					window.location.href = "?session=last";
					e.preventDefault();
					e.stopPropagation();
					return false;
				}
				break;
			case 117:  //F6
				localStorage.setItem("_refresh_scene", JSON.stringify( LS.GlobalScene.serialize() ) );
				location.reload();

				/*
				console.log("recompiling shaders...");
				Shaders.reloadShaders(); 
				LS.GlobalScene.refresh();
				*/
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; //F6
			case 38: //UP
				if(e.ctrlKey)
					SelectionModule.selectParentNode();
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
			case 39: //RIGHT
				if(e.ctrlKey)
					SelectionModule.selectSiblingNode();
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
			case 37: //LEFT
				if(e.ctrlKey)
					SelectionModule.selectSiblingNode( true );
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
			case 40: //DOWN
				if(e.ctrlKey)
					SelectionModule.selectChildNode();
				e.preventDefault();
				e.stopPropagation();
				return false;
				break; 
		}
	},

	/***************/
	onShowSettingsPanel: function(name,widgets)
	{
		if(name != "editor") return;
		widgets.addFlags( EditorModule.settings );
	},
};

CORE.registerModule( EditorModule );


//EXTRA WIDGETS for the Inspector ************************************************
LiteGUI.Inspector.widget_constructors["position"] = LiteGUI.Inspector.prototype.addVector3;


//to select a node, it uses identifiers, if you want to use nodes then add options.use_node
LiteGUI.Inspector.prototype.addNode = function( name, value, options )
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[ name ] = value;

	var node_name = "";
	if( value && value.constructor == LS.SceneNode )
		node_name = value.name;
	else if(value && value.constructor == String)
	{
		node_name = value;
		value = LS.GlobalScene.getNode(node_name);
	}
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+node_name+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener("change", function(e) { 
		if(options.use_node)
			value = LS.GlobalScene.getNode( e.target.value );
		else
			value = e.target.value;
		LiteGUI.Inspector.onWidgetChange.call(that, element, name, value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectNode( inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, $(element).find(".wcontent input").val() );
	});

	element.addEventListener("drop", function(e){
		e.preventDefault();
		e.stopPropagation();
		var node_uid = e.dataTransfer.getData("node_uid");
		if(options.use_node)
		{
			value = LS.GlobalScene.getNode( node_uid );
			input.value = value ? value.name : value;
		}
		else
		{
			value = node_uid;
			input.value = value;
		}
		LiteGUI.Inspector.onWidgetChange.call(that, element, name, value, options);
		return false;
	}, true);


	//after selecting a node
	function inner_onselect( node )
	{
		if(options.use_node)
		{
			value = node;
			input.value = node ? node.name : "";
		}
		else
		{
			value = node ? node.name : null;
			input.value = value;
		}

		LiteGUI.Inspector.onWidgetChange.call(that, element, name, value, options);
		//LiteGUI.trigger( input, "change" );
	}

	this.getValue = function() { return value; }

	this.tab_index += 1;
	this.append(element);
	return element;
}
LiteGUI.Inspector.widget_constructors["node"] = "addNode";

//to select a component from a node
LiteGUI.Inspector.prototype.addNodeComponent = function(name, value, options)
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[ name ] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener("change", function(e) { 
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectNode( inner_onselect );
		if(options.callback_button)
			options.callback_button.call(element, $(element).find(".wcontent input").val() );
	});

	//after selecting a node
	function inner_onselect( node )
	{
		input.value = node ? node._name : "";
		LiteGUI.trigger( input, "change" );
	}

	this.tab_index += 1;
	this.append(element);
	return element;
}
LiteGUI.Inspector.widget_constructors["node_component"] = "addNodeComponent";

//To select any kind of resource
function addGenericResource ( name, value, options, resource_classname )
{
	options = options || {};
	value = value || "";
	var that = this;

	resource_classname = resource_classname || options.resource_classname;

	if(value.constructor !== String)
		value = "@Object";

	this.values[name] = value;

	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener( "change", function(e) { 
		var v = e.target.value;
		if(v && v[0] != ":" && !options.skip_load)
			LS.ResourcesManager.load(v);
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,v, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		var o = { type: resource_classname, on_complete: inner_onselect };
		if(options.skip_load)
			o.skip_load = true;
		else
			o.on_load = inner_onload;
		EditorModule.showSelectResource( o );

		if(options.callback_button)
			options.callback_button.call( element, input.value);
	});

	function inner_onselect(filename)
	{
		value = input.value = filename;
		LiteGUI.trigger( input, "change" );
	}

	function inner_onload( filename ) //shouldnt this be moved to the "change" event?
	{
		if(options.callback_load)
			options.callback_load.call( element, filename );
	}

	//element.setAttribute("draggable","true");
	element.addEventListener("dragover",function(e){ 
		var path = e.dataTransfer.getData( "res-fullpath" );
		var type = e.dataTransfer.getData( "res-type" );
		if(path) // && (type == "Texture" || type == "Image") )
			e.preventDefault();
	},true);
	element.addEventListener("drop", function(e){
		var path = e.dataTransfer.getData("res-fullpath");
		if(path)
		{
			value = input.value = path;
			LiteGUI.trigger( input, "change" );
			e.stopPropagation();
		}
		else if (e.dataTransfer.files.length)
		{
			ImporterModule.importFile( e.dataTransfer.files[0], function(fullpath){
				value = input.value = fullpath;
				LiteGUI.trigger( input, "change" );
			});
			e.stopPropagation();
		}
		else if (e.dataTransfer.getData("text/uri-list") )
		{
			value = input.value = e.dataTransfer.getData("text/uri-list");
			LiteGUI.trigger( input, "change" );
			e.stopPropagation();
		}
		e.preventDefault();
		return false;
	}, true);

	element.getValue = function() { return value; }

	this.tab_index += 1;
	this.append(element, options);
	return element;
}

//to select a resource
LiteGUI.Inspector.prototype.addResource = function( name, value, options )
{
	return addGenericResource.call(this, name, value, options );
}

LiteGUI.Inspector.widget_constructors["resource"] = "addResource";

//to select a texture
LiteGUI.Inspector.prototype.addTexture = function( name, value, options )
{
	return addGenericResource.call(this, name, value, options, "Texture" );
}
LiteGUI.Inspector.widget_constructors["texture"] = "addTexture";

//to select a cubemap (texture)
LiteGUI.Inspector.prototype.addCubemap = LiteGUI.Inspector.prototype.addTexture;
LiteGUI.Inspector.widget_constructors["cubemap"] = "addCubemap";

LiteGUI.Inspector.prototype.addMesh = function(name,value, options)
{
	return addGenericResource.call(this, name, value, options, "Mesh" );
}

LiteGUI.Inspector.widget_constructors["mesh"] = "addMesh";

//to select a material
LiteGUI.Inspector.prototype.addMaterial = function( name,value, options)
{
	options = options || {};
	options.width = "85%";

	this.widgets_per_row += 1;
	var r = addGenericResource.call(this, name, value, options, "Material" );
	this.addButton(null,"Edit",{ width:"15%", callback: function(){
		var path = r.getValue();
		var material = LS.RM.getResource( path );
		if(!material || !material.constructor.is_material)
			return;
		EditorModule.inspect( material, this.inspector );
	}});
	this.widgets_per_row -= 1;
	return r;
}
LiteGUI.Inspector.widget_constructors["material"] = "addMaterial";

//to select a material
LiteGUI.Inspector.prototype.addAnimation = function( name,value, options)
{
	options = options || {};
	options.width = "85%";

	this.widgets_per_row += 1;
	var r = addGenericResource.call(this, name, value, options, "Animation" );
	this.addButton(null,"Edit",{ width:"15%", callback: function(){
		var path = r.getValue();
		var anim = LS.RM.getResource( path, LS.Animation );
		if(anim)
			AnimationModule.showTimeline( anim );
		else
			LS.RM.load( path, null, function(v){ AnimationModule.showTimeline( v ); });
	}});
	this.widgets_per_row -= 1;
	return r;
}
LiteGUI.Inspector.widget_constructors["animation"] = "addAnimation";


//to select texture and sampling options
LiteGUI.Inspector.prototype.addTextureSampler = function(name, value, options)
{
	options = options || {};
	value = value || {};
	var that = this;
	this.values[name] = value;

	var tex_name = "";
	if(value.texture)
		tex_name = typeof( value.texture ) == "string" ? value.texture : ":Texture";
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+tex_name+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");
	element.options = options;

	var callback = options.callback;

	options.callback = function(v)
	{
		input.value = (v && v.texture) ? v.texture : "";
		if(callback)
			callback.call(element, v);
	}

	input.addEventListener("change", function(e) { 
		var v = e.target.value;
		if(v && v[0] != ":" && !options.skip_load)
			LS.ResourcesManager.load( v );
		value.texture = v;
		LiteGUI.Inspector.onWidgetChange.call( that, element, name, value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener("click", function(e) { 
		EditorModule.showTextureSamplerInfo( value, options );
	});

	//element.setAttribute("draggable","true");
	element.addEventListener("dragover",function(e){ 
		var path = e.dataTransfer.getData("res-fullpath");
		var type = e.dataTransfer.getData( "res-type" );
		if(path) // && (type == "Texture" || type == "Image") )
			e.preventDefault();
	},true);
	element.addEventListener("drop", function(e){
		var path = e.dataTransfer.getData("res-fullpath");
		if(path)
		{
			input.value = path;
			LiteGUI.trigger( input, "change" );
			e.stopPropagation();
		}
		else if (e.dataTransfer.files.length)
		{
			ImporterModule.importFile( e.dataTransfer.files[0], function(fullpath){
				input.value = fullpath;
				LiteGUI.trigger( input, "change" );
			});
			e.stopPropagation();
		}
		else if (e.dataTransfer.getData("text/uri-list") )
		{
			input.value = e.dataTransfer.getData("text/uri-list");
			LiteGUI.trigger( input, "change" );
			e.stopPropagation();
		}

		e.preventDefault();
		return false;
	}, true);

	function inner_onselect( sampler )
	{
		input.value = sampler ? sampler.texture : "";
		LiteGUI.trigger( input, "change" );
		//$(element).find("input").val(filename).change();
	}

	this.tab_index += 1;
	this.append(element, options);
	return element;
}
LiteGUI.Inspector.widget_constructors["sampler"] = "addTextureSampler";
LiteGUI.Inspector.widget_constructors["position"] = "addVector3";

LiteGUI.Inspector.prototype.addLayers = function(name, value, options)
{
	options = options || {};
	var text = LS.GlobalScene.getLayerNames(value).join(",");

	options.callback_button = function() {
		EditorModule.showLayersEditor( value, function (layers,bit,v){
			value = layers;
			var text = LS.GlobalScene.getLayerNames(value).join(",");
			widget.setValue(text);
			if(options.callback)
				options.callback.call( widget, layers, bit, v );
		});
	};

	var widget = this.addStringButton(name, text, options);
	return widget;
}
LiteGUI.Inspector.widget_constructors["layers"] = "addLayers";


LiteGUI.Inspector.prototype.addRenderSettings = function(name, value, options)
{
	options = options || {};

	options.callback = function(){
		EditorModule.showRenderSettingsDialog( value );
	};

	return this.addButton(name,"Edit", options );
}
LiteGUI.Inspector.widget_constructors["RenderSettings"] = "addRenderSettings";


LiteGUI.Inspector.prototype.addRenderFrameContext = function( name, value, options )
{
	options = options || {};

	options.callback = function(){
		EditorModule.showRenderFrameContextDialog(value);
	};

	return this.addButton(name,"Edit", options );
}
LiteGUI.Inspector.widget_constructors["RenderFrameContext"] = "addRenderFrameContext";

//to select a node, value must be a valid node identifier (not the node itself)
LiteGUI.Inspector.prototype.addComponent = function( name, value, options)
{
	options = options || {};
	value = value || "";
	var that = this;
	this.values[ name ] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener("change", function(e) { 
		LiteGUI.Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});
	
	element.querySelector(".wcontent button").addEventListener( "click", function(e) { 
		EditorModule.showSelectComponent( value, options.filter, options.callback );
		if(options.callback_button)
			options.callback_button.call(element, $(element).find(".wcontent input").val() );
	});

	element.addEventListener("drop", function(e){
		e.preventDefault();
		e.stopPropagation();
		var node_id = e.dataTransfer.getData("uid");
		input.value = node_id;
		LiteGUI.trigger( input, "change" );
		return false;
	}, true);


	//after selecting a node
	function inner_onselect( node )
	{
		input.value = node ? node._name : "";
		LiteGUI.trigger( input, "change" );
	}

	this.tab_index += 1;
	this.append(element);
	LiteGUI.focus( input );
	return element;
}
LiteGUI.Inspector.widget_constructors["component"] = "addComponent";

//NOT TESTED
LiteGUI.Inspector.prototype.addShader = function( name, value, options )
{
	options = options || {};
	var inspector = this;

	options.width = "80%";
	options.resource_classname = "ShaderCode";

	inspector.widgets_per_row += 1;

	var widget = inspector.addResource( name, value, options );

	inspector.addButtons( null, [LiteGUI.special_codes.refresh, LiteGUI.special_codes.open_folder], { skip_wchange: true, width: "20%", callback: inner } );

	inspector.widgets_per_row -= 1;

	function inner(v)
	{
		if( v == LiteGUI.htmlEncode( LiteGUI.special_codes.refresh ) )
		{
			if(options.callback_refresh)
				options.callback_refresh.call( widget );//material.processShaderCode();
		}
		else if( v == LiteGUI.htmlEncode( LiteGUI.special_codes.open_folder ) )
		{
			//no shader, ask to create it
			if(!value)
			{
				inner_create_shader();
				return;
			}

			//edit shader
			var shader_code = LS.RM.resources[ value ];
			if(shader_code)
				CodingModule.editInstanceCode( shader_code, null, true );
			else
				LiteGUI.confirm("ShaderCode not found, do you want to create it?", function(v){
					if(v)
						inner_create_shader();
				});
		}

		function inner_create_shader()
		{
			DriveModule.showSelectFolderFilenameDialog("my_shader.glsl", function(folder,filename,fullpath){
				var shader_code = new LS.ShaderCode();
				shader_code.code = LS.ShaderCode.examples.color;
				LS.RM.registerResource( fullpath, shader_code );
				if(options.callback_open)
					options.callback_open.call( widget, fullpath );
				if(options.callback)
					options.callback.call(widget, fullpath);
				CodingModule.editInstanceCode( shader_code, null, true );
			},{ extension:"glsl", allow_no_folder: true } );
		}

		inspector.refresh();
	}

	return widget;
}
LiteGUI.Inspector.widget_constructors["shader"] = "addShader";




