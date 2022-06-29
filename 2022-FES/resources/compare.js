(function(root){

	var OI = root.OI || {};
	if(!OI.ready){
		OI.ready = function(fn){
			// Version 1.1
			if(document.readyState != 'loading') fn();
			else document.addEventListener('DOMContentLoaded', fn);
		};
	}

	function Compare(opt){
		var c,_obj,s,btn;
		this.version = "0.1";
		this.options = opt||{};
		this.data = {};
		this.values = {};
		this.lookup = {};
		this.series = {};
		this.charts = {};
		this.sliders = {};
		this.years = {};

		// Get dropdowns
		this.input = {
			'a':{
				'area': document.getElementById('area-a'),
				'scenario': document.getElementById('scenario-a'),
				'parameter': document.getElementById('parameter-a')
			},
			'b':{
				'area': document.getElementById('area-b'),
				'scenario': document.getElementById('scenario-b'),
				'parameter': document.getElementById('parameter-b')
			}
		};

		_obj = this;

		// Add events to dropdowns
		for(c in this.input){
			for(s in this.input[c]){
				this.input[c][s].setAttribute('comparison',c);
				this.input[c][s].addEventListener('change',function(e){ _obj.update(e.target.getAttribute('comparison')); });
			}
			this.values[c] = {};
		}

		// Store the areas
		this.addAreas(opt.areas||{});

		var mapattr = opt.map||{'background':'transparent'};
		
		this.maps = {}
		this.mapdata = {};
		for(c in this.input) this.maps[c] = OI.BasicMap(document.getElementById('map-'+c),mapattr);

		// Load initial data files
		this.getJSON("data/scenarios/index-electricity-maps.json", this.addScenarios );
		this.getJSON("data/scenarios/parameters-electricity-maps.json", this.addParameters );
		this.getJSON("data/gridsupplypoints2nuts1.json", this.addSplits );
		this.getJSON("data/maps/nuts1_BUC_4326.geojson", this.addMap );

		// Add year sliders
		this.yearrange = { min: 2020, max: 2050 };
		function addSlider(c,el,_obj){
			noUiSlider.create(el, {
				range: _obj.yearrange,
				start: [2022],
				step: 1,
				pips: {mode: 'values', values: [2020,2030,2040,2050]}
			});
			// Bind the changing function to the update event.
			el.noUiSlider.on('update',function(){ _obj.setYear(c,parseInt(this.get())); });
			return el;
		}
		// Create the sliders
		for(c in this.input) this.sliders[c] = addSlider(c,document.getElementById('slider-'+c),this);

		function makeDownload(filename,btn,src){
			if(btn) btn.addEventListener('click',function(e){ saveToFile(src.innerHTML,filename,'image/svg+xml'); });
			else console.warn('No button to attach src to.',src);
		}
		// Add download buttons
		for(c in this.input){
			makeDownload('map.svg',document.getElementById('download-map-'+c),document.getElementById('map-'+c));
			makeDownload('chart.svg',document.getElementById('download-chart-'+c),document.getElementById('chart-'+c));
		}
	
		makeDownload('chart-combined.svg',document.getElementById('download-chart'),document.getElementById('chart'));
		return this;
	}
	Compare.prototype.setYear = function(c,y){
		if(typeof y!=="number") y = parseInt(this.sliders[c].noUiSlider.get());
		this.years[c] = y;
		this.updateMap(c);
		var els = document.querySelectorAll('.year-'+c);
		for(var i = 0; i < els.length; i++) els[i].innerHTML = y;
		this.updateYearHighlights(c,y);
		return this;
	};
	Compare.prototype.updateYearHighlights = function(c,y){
		if(this.sliders[c]){
			// Remove any existing highlights
			var els = this.charts[c].el.querySelectorAll('circle.highlight');
			for(i = 0; i < els.length; i++) els[i].classList.remove('highlight');
			// Add highlights to nth circles in each series
			var dots = this.charts[c].el.querySelectorAll('g.linechart-series circle:nth-of-type('+(y-this.yearrange.min+1)+')');
			for(i = 0; i < dots.length; i++) dots[i].classList.add('highlight');
		}
		return this;
	};
	Compare.prototype.update = function(c){
		var s,sel;
		
		// Get all the values from the select dropdowns
		for(s in this.input[c]){
			sel = this.input[c][s];
			this.values[c][s] = this.input[c][s].options[this.input[c][s].selectedIndex].value;
		}

		// Have the appropriate dropdowns got values?
		if(this.values[c].scenario && this.values[c].parameter){

			// Could add loader animations to this comparison

			// Clear any existing values
			this.data[c] = {};

			// Load the data file
			this.getCSV('data/scenarios/'+this.scenarios[this.values[c].scenario].data[this.values[c].parameter].file,{
				'comparison':c,
				'key':this.scenarios[this.values[c].scenario].data[this.values[c].parameter].key,
				'success':function(csv,opt){
					this.data[opt.comparison] = csv;
					this.initData(opt.comparison);
				}
			});
		}
		if(this.values[c].area){
			console.info('Set area',c,this.values[c].area);
		}
		return this;
	};

	Compare.prototype.getJSON = function(file,cb){
		fetch(file).then(response => {
			if(!response.ok) throw new Error('Network response was not OK');
			return response.json();
		}).then(json => {
			if(typeof cb==="function") cb.call(this,json);
			else console.warn('No callback function provided for getJSON');
		}).catch(error => {
			console.error('Unable to load the data from '+file,error);
		});
		return this;
	};

	Compare.prototype.getCSV = function(file,opt){
		var key,cb;
		if(!opt) opt = {};
		key = opt.key;
		cb = opt.success;
		fetch(file).then(response => {
			if(!response.ok) throw new Error('Network response was not OK');
			return response.text();
		}).then(txt => {
			if(typeof cb==="function") cb.call(this,parseCSV(txt,key||""),opt);
			else console.warn('No callback function provided for getCSV');
		}).catch(error => {
			console.error('Unable to load the data',error);
		});
		return this;
	};

	// Store the defined ares
	Compare.prototype.addAreas = function(json){
		var a,c;
		this.areas = (json);
		this.lookup = {};
		var html = "";
		for(a in this.areas){
			html += '<option value="'+this.areas[a].areas+'">'+a+'</option>';
			this.lookup[this.areas[a].areas] = a;
		}
		for(c in this.input) this.input[c].area.innerHTML += html;
		return this;
	};

	// Save the loaded scenarios and update the dropdowns
	Compare.prototype.addScenarios = function(json){
		var s,c;
		if(json.length){
			this.scenarios = {};
			// New style (1.5.0) config is an array to preserve order - convert into object
			for(var i = 0; i < json.length; i++){
				if(json[i].key) this.scenarios[json[i].key] = json[i];
			}
		}else this.scenarios = json;
		var html = "";
		for(s in this.scenarios) html += '<option'+(this.options.scenario == s ? ' selected="selected"':'')+' class="'+(this.scenarios[s].css ? this.scenarios[s].css : 'b1-bg')+'" value="'+s+'">'+s+'</option>';
		for(c in this.input) this.input[c].scenario.innerHTML += html;
		return this.init();
	};

	// Save the loaded parameters and update the dropdowns
	Compare.prototype.addParameters = function(json){
		var p,g,gorder,groups,i,j,html,c;
		if(json.length){
			this.parameters = {};
			// New style (1.5.0) config is an array to preserve order - convert into object
			for(var i = 0; i < json.length; i++){
				if(json[i].key) this.parameters[json[i].key] = json[i];
			}
		}else this.parameters = json;
		gorder = [];
		groups = {};
		html = '';
		for(p in this.parameters){
			g = this.parameters[p].optgroup||"all";
			if(!groups[g]){
				groups[g] = [];
				gorder.push(g);
			}
			groups[g].push(p);
		}
		for(i = 0; i < gorder.length; i++){
			g = gorder[i];
			if(g != "all") html += '<optgroup label="'+g+'">';
			for(j = 0; j < groups[g].length; j++){
				p = groups[g][j];
				html += '<option'+(this.options.parameter == p ? ' selected="selected"':'')+' value="'+p+'">'+this.parameters[p].title+'</option>';
			}
			if(g != "all") html += '</optgroup>';
		}
		for(c in this.input) this.input[c].parameter.innerHTML += html;
		return this.init();
	};

	// Save the splits
	Compare.prototype.addSplits = function(json){
		this.splits = json;
		return this.init();
	};

	// Save the splits
	Compare.prototype.addMap = function(geojson){
		this.mapgeojson = geojson;
		return this;
	};

	// Is the initial data loaded?
	Compare.prototype.init = function(){
		if(this.scenarios && this.parameters && this.areas && this.splits){
			console.info('Loaded',this);
		}
		return this;
	};

	// Should we process the loaded data?
	Compare.prototype.initData = function(c){
		var ok,val,a,p,r,v,ch;
		var origc = c;
		var series = {};
		ok = true;
		if(this.data[c]){
			// Process splits
			p = this.values[c].parameter;
			// Loop over split areas
			for(a in this.splits){
				val = 0;
				// For each region in the split we need to be working out values
				for(r in this.splits[a]){
					if(!this.data[c][r]) this.data[c][r] = {};
					for(v in this.data[c][a]){
						// Set to zero initially
						if(!this.data[c][r][v]) this.data[c][r][v] = {'val':0,'n':0};
						// If the column looks like a number based column
						if(!isNaN(v)){
							if(this.parameters[p].combine=="sum" || this.parameters[p].combine=="average"){
								// Find the fractional contribution
								this.data[c][r][v].val += this.data[c][a][v] * this.splits[a][r];
							}else if(this.parameters[p].combine=="max"){
								// Find the maximum of any contribution
								this.data[c][r][v].val = Math.max(this.data[c][r][v].val,this.data[c][a][v]);
							}
							this.data[c][r][v].n++;
						}
					}
				}
			}

			// Now loop over and finish processing the areas
			for(a in this.data[c]){
				for(v in this.data[c][a]){
					if(typeof this.data[c][a][v]==="object"){
						if(this.parameters[p].combine=="average") this.data[c][a][v].val /= (this.data[c][a][v].n||1);
						this.data[c][a][v] = this.data[c][a][v].val;
					}
				}
			}


			console.info('Loaded data',c,this.data[c],this.series);
		}
		
		this.updateCharts();
		this.updateMap(origc);

		return this;
	};
	Compare.prototype.updateMap = function(c){
		if(this.data[c] && this.maps[c] && this.values[c].area && this.mapgeojson){

			// Remove any existing data layer
			this.maps[c].removeLayer('data-layer');

			// Limit original geojson file to just the areas we want
			var s,d,min,max,geo;
			geo = {'features':[]};
			min = 1e100;
			max = -1e100;
			for(s = 0; s < this.series[c].length; s++){
				areas = this.series[c][s].id.split(/\+/g);
				for(a = 0; a < areas.length; a++){
					for(g = 0; g < this.mapgeojson.features.length; g++){
						if(this.mapgeojson.features[g].properties.nuts118cd == areas[a]){
							geo.features.push(this.mapgeojson.features[g]);
						}
					}
				}
				for(d = 0; d < this.series[c][s].data.length; d++){
					min = Math.min(min,this.series[c][s].data[d].y);
					max = Math.max(max,this.series[c][s].data[d].y);
				}
			}

			this.maps[c].addLayersBefore('labels',{
				'id': 'data-layer',
				'data': geo,
				'options': { 'color': 'green' },
				'values': { 'compare': this, 'year': this.years[c], 'column': c, 'key': 'nuts118cd', 'min':min, 'max': max, 'data': this.mapdata[c], 'colour': this.scenarios[this.values[c].scenario].color },
				'style': function(feature,el){
					var v,code,r,op;
					v = this.attr.values;
					code = feature.properties[v.key];
					r = v.compare.lookup[code];
					if(typeof v.data[code][v.year]!=="number") console.warn('No data for '+code+' in '+v.year+'.',v.data[code]);
					op = 0.1 + 0.8*((v.data[code][v.year]||0)-v.min)/(v.max-v.min);
					el.style.fillOpacity = op;
					el.style.fill = v.colour; //v.compare.areas[r].colour;
					el.style.stroke = v.colour; //v.compare.areas[r].colour;
					el.style['stroke-width'] = 2;
					el.style['stroke-opacity'] = 0.1;
				}
			});
		}
		return this;
	};
	Compare.prototype.updateCharts = function(){
		var c,ok,series,p,s,i,y,v,a,ch;
		ok = true;
		for(c in this.input){
			if(!this.data[c]){
				ok = false;
			}else{
				if(!this.mapdata[c]) this.mapdata[c] = {};
				if(this.values[c].area){
					// Create the data series
					series = this.values[c].area.split(/;/g);
					p = this.values[c].parameter;
					s = this.values[c].scenario;
					this.series[c] = new Array(series.length);
					
					for(i = 0; i < series.length; i++){
						this.series[c][i] = {'orig':series[i],'areas':series[i].split(/\+/g),'data':[],'title':(s + '\n'+this.parameters[p].title + '\n' + this.lookup[series[i]]),'id':series[i]};
						//this.mapdata[c][this.series[c][i].areas[0]] = {};
						for(a = 0; a < this.series[c][i].areas.length; a++){
							if(!this.mapdata[c][this.series[c][i].areas[a]]) this.mapdata[c][this.series[c][i].areas[a]] = {};
						}
						for(y in this.data[c][this.series[c][i].areas[0]]){

							// If this column is a number
							if(!isNaN(y)){

								v = {'val':0,'n':0};

								// Loop over the areas that we need to combine
								for(a = 0; a < this.series[c][i].areas.length; a++){
									// If it is a sum or average we add them up
									if(this.parameters[p].combine=="sum" || this.parameters[p].combine=="average"){
										v.val += this.data[c][this.series[c][i].areas[a]][y]||0;
									}else if(this.parameters[p].combine=="max"){
										// Find the maximum of any contribution
										v.val = Math.max(v.val,this.data[c][this.series[c][i].areas[a]][y]||0);
									}
									// Keep a count so we can calculate an average
									v.n++;
								}

								// Calculate an average if necessary
								if(this.parameters[p].combine=="average") v.val /= (v.n||1);

								for(a = 0; a < this.series[c][i].areas.length; a++){
									//if(!this.mapdata[c][this.series[c][i].areas[a]]) this.mapdata[c][this.series[c][i].areas[a]] = {};
									this.mapdata[c][this.series[c][i].areas[a]][y] = v.val;
								}

								// Keep the data point for this series
								if(!isNaN(v.val)) this.series[c][i].data.push({'x':parseInt(y),'y':v.val,'dp':this.parameters[p].dp,'units':this.parameters[p].units});
								else console.warn('No value for ',s,p,c,this.series[c][i].areas[0],y,v);
							}
						}
					}
				}

				if(!this.charts[c]){
					ch = document.getElementById('chart-'+c);
					ch.innerHTML = '';
					this.charts[c] = OI.linechart(ch,{
						'left':16,
						'right':20,
						'top':10,
						'bottom':50,
						'axis':{
							'x':{
								'title': { 'label': 'Year' },
								'labels':{
									"2020": {'label':2020},
									"2030": {'label':2030},
									"2040": {'label':2040},
									"2050": {'label':2050}
								}
							},
							'y':{
								'line': {'show':false},
								'min': 0,
								'title':{ 'label':'' }
							}
						}
					});
					this.charts[c].on('click',{this:this,'c':c},function(e,a){ this.sliders[e.c].noUiSlider.set(this.yearrange.min+e.i); });
				}else this.charts[c].clear();
				
				if(this.series[c]){
					// Now add the data series
					for(s = 0; s < this.series[c].length; s++){
						colour = '#000000';
						if(this.lookup[this.series[c][s].id] && this.areas[this.lookup[this.series[c][s].id]]) colour = this.areas[this.lookup[this.series[c][s].id]].colour;
						this.charts[c].addSeries(this.series[c][s].data,{
							'points':{ 'size':4, 'color': colour },
							'line':{'color': colour,'stroke-dasharray': (c == "a" ? '' : '5,5')},
							'title': this.series[c][s].title,
							'tooltip':{
								'label': function(d){
									return ''+d.series.title+'\n'+d.data.x+': '+d.data.y.toFixed(d.data.dp)+' '+d.data.units;
								}
							}
						});
					}
					this.charts[c].draw();
				}
				// Update the year highlights
				if(this.sliders[c]) this.updateYearHighlights(c,parseInt(this.sliders[c].noUiSlider.get()));
			}
		}
		if(ok){
			console.info('Loaded all data');
			ok = true;
			for(c in this.input){
				if(!this.values[c].area) ok = false;
			}

			if(ok){
				if(!this.charts.combined){
					document.getElementById('chart').innerHTML = '';
					this.charts.combined = OI.linechart(document.getElementById('chart'),{
						'left':30,
						'right':20,
						'top':10,
						'bottom':50,
						'axis':{
							'x':{
								'title': { 'label': 'Year' },
								'labels':{
									"2020": {'label':2020},
									"2030": {'label':2030},
									"2040": {'label':2040},
									"2050": {'label':2050}
								}
							},
							'y':{
								'line': {'show':false},
								'min': 0,
								'title':{ 'label':'' }
							}
						}
					});
				}else this.charts.combined.clear();
				
				for(c in this.input){
					for(s = 0; s < this.series[c].length; s++){
						colour = '#000000';
						if(this.lookup[this.series[c][s].id] && this.areas[this.lookup[this.series[c][s].id]]) colour = this.areas[this.lookup[this.series[c][s].id]].colour;
						this.charts.combined.addSeries(this.series[c][s].data,{
							'points':{ 'size':4, 'color': colour },
							'line':{'color': colour, 'stroke-dasharray': (c == "a" ? '' : '5,5') },
							'title': this.series[c][s].title,
							'tooltip':{
								'label': function(d){
									return ''+d.series.title+'\n'+d.data.x+': '+d.data.y.toFixed(d.data.dp)+' '+d.data.units;
								}
							}
						});
					}
				}
				this.charts.combined.draw();
			}
		}

		return this;
	};

	// parseCSV 1.1
	function parseCSV(txt,idx) {
		var r,data,header,rows,d,i,c;
		rows = txt.replace(/[\n\r]+$/,"").split(/[\n\r]+/);
		for(r = 0; r < rows.length; r++) rows[r] = rows[r].split(/,/);
		header = rows.shift();
		data = {};
		for(r = 0; r < rows.length; r++){
			d = {};
			i = r;
			for(c = 0; c < rows[r].length; c++){
				if(!isNaN(rows[r][c])) rows[r][c] = parseFloat(rows[r][c]);
				d[header[c]] = rows[r][c];
				if(header[c]==idx) i = rows[r][c];
			}
			data[i] = d;
		}
		return data;
	}

	function saveToFile(txt,fileNameToSaveAs,mime){
		// Bail out if there is no Blob function
		if(typeof Blob!=="function") return this;

		var textFileAsBlob = new Blob([txt], {type:(mime||'text/plain')});

		function destroyClickedElement(event){ document.body.removeChild(event.target); }

		var dl = document.createElement("a");
		dl.download = fileNameToSaveAs;
		dl.innerHTML = "Download File";

		if(window.webkitURL != null){
			// Chrome allows the link to be clicked without actually adding it to the DOM.
			dl.href = window.webkitURL.createObjectURL(textFileAsBlob);
		}else{
			// Firefox requires the link to be added to the DOM before it can be clicked.
			dl.href = window.URL.createObjectURL(textFileAsBlob);
			dl.onclick = destroyClickedElement;
			dl.style.display = "none";
			document.body.appendChild(dl);
		}
		dl.click();
	}
	root.Compare = function(opt){ return new Compare(opt); };

	root.OI = OI;
	
})(window || this);