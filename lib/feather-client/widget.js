(function() {

  /**
   * This is the public interface to return for the feather.widget class definition.
   * The base class is feather.fsm.FiniteStateMachine, therefore all widgets must
   * be instantiated with at least an 'initial' state definition.
   */
  feather.widget = Class.create(feather.fsm.finiteStateMachine, {
    /**
     * Constructor
     * @param {Object} $super The base class constructor (automatically wired)
     * @param {Object} options The configuration options for the instance
     */
    initialize: function($super, options) {
      var me = this;
      options = options || {};
      options.states = options.states || feather.widget.defaultStates;
      $super(options);
      
      //dom management objects
      this.domEvents = new feather.event.domEventCache();
      
      //container options
      this.containerWrapper = options.containerWrapper;
      this.container = options.container;
      this.containerId = options.containerId;
      this.keepContainerOnDispose = options.keepContainerOnDispose;
      if (this.container) {
        this.containerId = this.container.attr("id");
      } else if (this.containerId && !this.container) {
        this.onceState("ready", function() {
          me.container = $(me.containerId);
        });
      }
      
      this.myid = options.myid; //the shortened version of the auto prefixed long id (note: this can be a collision with other widgets so don't rely on it too much; its main use is to auto-attach an instance property for children)
      
      //children/parent relationships
      if (options.parent) {
        options.parent.children = options.parent.children || new feather.lang.registry();
        options.parent.children.add(this);
        options.parent[this.myid] = this;
        this.parent = options.parent;
      }
      
      //add this instance to the widget registry
      feather.widget.widgets.add(this);
    },
    /**
     * widget-scoped jQuery selector method
     */
    get: function(selector) {
      //fix id based selectors (if you are trying to do an absolute ID selector not scoped to this widget, just use $() instead of this.$())
      if (selector.indexOf("#") == 0) {
        selector = "#" + this.id + "_" + selector.substr(1);
      }
      var el = $(selector, this.container || null);
      return el;
    },
    render: function(options) {
      this.fire("render", options); // behavior implemented via FSM controller        
    },
    dispose: function($super) {
      feather.widget.widgets.remove(this);
      if (this.domEvents) {
        this.domEvents.dispose();
      }
      //kill the children
      if (this.children && this.children.each) {
        this.children.each(function(child) {
          try {
            child && child.dispose && child.dispose();
          } catch (ex) {
          }
        });
      }
      //remove UI elements
      if (this.container) {
        if (this.keepContainerOnDispose) {
          this.container.html("");
        } else {
          this.container.remove();
        }
      }
      this.fire("disposed");
      $super();
    }
  });
  
  /**
   * Default widget FSM client states
   */
  feather.widget.defaultStates = {
    initial: {
      stateStartup: function(widget, args) {
      
      },
      render: function(widget, args) {
        //move to the rendering state (if present)
        return widget.states.rendering;
      },
      ready: function(widget, args) {
        return widget.states.ready;
      }
    },
    ready: {//this state indicates rendering has completed, the widget's DOM is ready for manipulation (if the widget has a UI)
      stateStartup: function(widget, args) {
        if (!widget.isReady && widget.onReady) { //only execute the inline onReady method once
          widget.fire("beforeReady", args);
          widget.fire("inlineReady", args); //implementing this way to allow potential suppression or other scenarios                    
        }
        widget.isReady = true;
      },
      inlineReady: function(widget, args) {
        widget.onReady(args);
      }
    },
    rendering: {
      rendered: function(widget, args) {
        return widget.states.ready;
      }
    }
  };
  
  /**
   * A registry to cache already loaded classes to prevent duplicate loads.
   * This registry will enforce unique ids and will fire events when items are added (allow other code to listen and take action if needed)
   */
  feather.widget.loadedClasses = new feather.lang.registry();
  
  /**
   * A registry to cache all widget instances to allow other code to listen and take action as needed.
   */
  feather.widget.widgets = new feather.lang.registry();
  
  /**
   * Helper factory method for creating widget subclass definitions.
   * This will allow other code to be injected into the class loading pipeline as needed,
   * as well as handle common concerns for FSM and templating setup.
   * @param {Object} options
   */
  feather.widget.create = function(options) {
    var classObj = feather.widget.loadedClasses.findById(options.path);
    if (!classObj) {
      classObj = {
        id: options.path,
        name: options.name
      };
      options.prototype.widgetPath = options.path;
      options.prototype.widgetName = options.name;
      //fire an event that will allow outside code to have a say in how the class gets constructed,
      //for example: to decorate the prototype object as needed            
      feather.widget.widgets.fire("beforeWidgetClassCreation", {
        options: options
      });
      var classDef = Class.create(feather.widget, options.prototype);
      classObj.classDef = classDef;
      feather.widget.loadedClasses.add(classObj);
    }
    return classObj.classDef;
  };
  
  /**
   * Helper method for loading widgets from the server
   */
  feather.widget.load = function(options) {
    var widgetClass = feather.widget.loadedClasses.findById(options.path);
    //use the sysChannel for this operation (requires socket connection to be ready)
    feather.socket.stateMachine.onceState("ready", function() {
      var id = feather.id();
      //setup the reply handler
      feather.socket.sysChannel.once("loadwidget:" + id, function(args) {
        var cb = function() {
          if (args.result.html && options.clientOptions.container) {
            options.clientOptions.container.append(args.result.html);
          }
          if (args.result.script) {
            var func = eval(args.result.script);
            func(options.clientOptions);
          }
        };
        var files = [];
        args.result.widgetClasses.each(function(widgetClass) {
          if (!feather.widget.loadedClasses.findById(widgetClass)) {
            var widgetName = widgetClass.match(/[^\/]*\/$/)[0].replace("/", "");
            files.push("/" + widgetClass + widgetName + ".client.js");
          }
        });
        if (files.length == 0) {
          cb();
        } else {
          feather.util.loadScripts({
            files: files,
            callback: cb
          });
        }
      });
      //fire off the message
      feather.socket.sysChannel.fire("loadwidget", {
        messageId: id,
        path: options.path,
        options: options.serverOptions
      });      
    });
  };
})();