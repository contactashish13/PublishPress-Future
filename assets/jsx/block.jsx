(function ( wp, config ) {

    const { registerPlugin } = wp.plugins;
    const { __ } = wp.i18n;
    const { PluginDocumentSettingPanel } = wp.editPost;
    const { PanelRow, DateTimePicker, CheckboxControl, SelectControl, FormTokenField, Spinner } = wp.components;
    const { Fragment, Component } = wp.element;
    const { decodeEntities } = wp.htmlEntities;
    const { isEmpty, keys, compact } = lodash;

    class PostExpiratorSidebar extends Component {
        constructor() {
            super( ...arguments );

            this.state = {
                categoriesList: [],
                catIdVsName: [],
            }
        }

        componentWillMount() {
            const { attributes } = this.state;

            const postMeta = wp.data.select( 'core/editor' ).getEditedPostAttribute( 'meta' );
            const postType = wp.data.select('core/editor').getCurrentPostType();

            let enabled = config.defaults.autoEnable == 1;
            let date = new Date();

            let expireAction = this.getExpireType(postMeta);

            let categories = [];
            if(expireAction.includes('category')){
                categories = this.getCategories(postMeta);
            }

            if(postMeta['_expiration-date-status'] && postMeta['_expiration-date-status'] === 'saved'){
                enabled = true;
            }

            if(postMeta['_expiration-date']){
                date.setTime((postMeta['_expiration-date'] + date.getTimezoneOffset() * 60) * 1000);
            }else{
                categories = config.default_categories;
                if(config.default_date){
                    date.setTime((parseInt(config.default_date) + date.getTimezoneOffset() * 60) * 1000);
                    // update the post meta for date so that the user does not have to click the date to set it
                    const setPostMeta = (newMeta) => wp.data.dispatch( 'core/editor' ).editPost( { meta: newMeta } );
                    setPostMeta( {'_expiration-date': this.getDate(date) } );
                }
            }

            let taxonomy = config.defaults.taxonomy || 'category';

            this.setState( {
                enabled: enabled,
                date: date,
                expireAction: expireAction,
                categories: categories,
                taxonomy: taxonomy,
            } );

            let categoriesList = [];
            let catIdVsName = [];

            if( (!taxonomy && postType === 'post') || taxonomy === 'category' ){
                wp.apiFetch( {
                    path: wp.url.addQueryArgs( 'wp/v2/categories', { per_page: -1, hide_empty: false } ),
                } ).then( ( list ) => {
                    list.forEach(cat => {
                        categoriesList[ cat.name ] = cat;
                        catIdVsName[ cat.id ] = cat.name;
                    });
                    this.setState( { categoriesList: categoriesList, catIdVsName: catIdVsName, taxonomy: __( 'Category' ) } );
                } );
            }else if(postType !== 'page') {
                wp.apiFetch( {
                    path: wp.url.addQueryArgs( `wp/v2/taxonomies/${taxonomy}`, { context: 'edit' } ),
                } ).then( ( taxAttributes ) => {
                    // fetch all terms
                    wp.apiFetch( {
                        path: wp.url.addQueryArgs( `wp/v2/${taxAttributes.rest_base}`, { context: 'edit' } ),
                    } ).then( ( terms ) => {
                        terms.forEach(term => {
                            categoriesList[ decodeEntities(term.name) ] = term;
                            catIdVsName[ term.id ] = decodeEntities(term.name);
                        });
                        this.setState( { categoriesList: categoriesList, catIdVsName: catIdVsName, taxonomy: decodeEntities(taxAttributes.name) } );
                    });
                });
            }

        }

        componentDidUpdate() {
            const { enabled, date, expireAction, categories, attribute } = this.state;
            const setPostMeta = (newMeta) => wp.data.dispatch( 'core/editor' ).editPost( { meta: newMeta } );

            switch(attribute){
                case 'enabled':
                    setPostMeta( { '_expiration-date-status' : (enabled ? 'saved' : '' ) } );
                    break;
                case 'date':
                    if(typeof date === 'string'){
                        setPostMeta( {'_expiration-date': this.getDate(date) } );
                    }
                    break;
                case 'action':
                    setPostMeta( { '_expiration-date-type': expireAction } );
                    if(!expireAction.includes('category')){
                        setPostMeta( { '_expiration-date-categories': [] } );
                    }
                    break;
                case 'category':
                    setPostMeta( { '_expiration-date-categories': categories } );
                    break;
            }

        }

        render() {
            const { categoriesList, catIdVsName } = this.state;
            const { enabled, date, expireAction, categories, taxonomy } = this.state;

            const postType = wp.data.select('core/editor').getCurrentPostType();

            let actionsList = [
                { label: __( 'Draft', 'post-expirator' ), value: 'draft' },
                { label: __( 'Delete', 'post-expirator' ), value: 'delete' },
                { label: __( 'Trash', 'post-expirator' ), value: 'trash' },
                { label: __( 'Private', 'post-expirator' ), value: 'private' },
                { label: __( 'Stick', 'post-expirator' ), value: 'stick' },
                { label: __( 'Unstick', 'post-expirator' ), value: 'unstick' },
            ];

            if(postType !== 'page'){
                actionsList = _.union(actionsList, [
                    { label: __('Category: Replace', 'post-expirator'), value: 'category' },
                    { label: __('Category: Add', 'post-expirator'), value: 'category-add' },
                    { label: __('Category: Remove', 'post-expirator'), value: 'category-remove' },
                ]);
            }

            let selectedCats = categories && compact(categories.map((id) => catIdVsName[id] || false ));
            if(typeof selectedCats === 'string'){
                selectedCats = [];
            }
    
            return (
                <PluginDocumentSettingPanel title={ __( 'Post Expirator', 'post-expirator' ) } icon="calendar" initialOpen={ enabled }>
                    <PanelRow>
                        <CheckboxControl
                            label={ __( 'Enable Post Expiration', 'post-expirator' ) }
                            checked={ enabled }
                            onChange={ (value) => { this.setState( { enabled: !enabled, attribute: 'enabled' } ) } }
                        />
                    </PanelRow>
                    { enabled && (
                        <Fragment>
                            <PanelRow>
                                <DateTimePicker
                                    currentDate={ date }
                                    onChange={ ( value ) => this.setState( { date: value, attribute: 'date' } ) }
                                    is12Hour={ true }
                                />
                            </PanelRow>
                            <SelectControl
                                label={ __( 'How to expire', 'post-expirator' ) }
                                value={ expireAction }
                                options={ actionsList }
                                onChange={ (value) => { this.setState( { expireAction: value, attribute: 'action' } ) } }
                            />
                            { expireAction.includes('category') && 
                                (
                                    ( isEmpty(keys(categoriesList)) && (
                                        <Fragment>
                                            { __( 'Loading', 'post-expirator' ) + ` (${taxonomy})` }
                                            <Spinner/>
                                        </Fragment>
                                    ) )
                                    ||
                                    (
                                <FormTokenField
                                    label={ __('Expiration Categories', 'post-expirator') + ` (${taxonomy})` }
                                    value={ selectedCats }
                                    suggestions={ Object.keys(categoriesList) }
                                    onChange={ ( value ) => { this.setState( { categories: this.selectCategories(value), attribute: 'category' } ) } }
                                    maxSuggestions={ 10 }
                                />
                                    )
                            ) }
                        </Fragment>
                    ) }
                </PluginDocumentSettingPanel>
            );
        }

        // what action to take on expiration
        getExpireType(postMeta) {
            let typeNew = postMeta['_expiration-date-type'];
            let typeOld = postMeta['_expiration-date-options'] && postMeta['_expiration-date-options']['expireType'];

            if(typeNew){
                return typeNew;
            }

            if(typeOld){
                return typeOld;
            }

            return 'draft';
        }

        // what categories to add/remove/replace
        getCategories(postMeta) {
            let categoriesNew = postMeta['_expiration-date-categories'] && postMeta['_expiration-date-categories'];
            let categoriesOld = postMeta['_expiration-date-options'] && postMeta['_expiration-date-options']['category'];

            if(typeof categoriesNew === 'object' && categoriesNew.length > 0){
                return categoriesNew;
            }

            if(categoriesOld && typeof categoriesOld !== 'undefined' && typeof categoriesOld !== 'object'){
                categories = [ categoriesOld ];
            }

            return categoriesOld;

        }

        // fired for the autocomplete
        selectCategories(tokens) {
            const { categoriesList, catIdVsName } = this.state;

            var hasNoSuggestion = tokens.some(function (token) {
                return typeof token === 'string' && !categoriesList[token];
            });

            if (hasNoSuggestion) {
                return;
            }

            var categories = tokens.map(function (token) {
                return typeof token === 'string' ? categoriesList[token] : token;
            })

            return categories.map( (cat) => cat.id );
        }

        getDate(date){
            let newDate = new Date();
            newDate.setTime(Date.parse(date));
            newDate.setTime(newDate.getTime() - new Date().getTimezoneOffset() * 60 * 1000);
            return ((newDate.getTime()) / 1000);
        }

    }

    registerPlugin( 'postexpirator-sidebar', {
        render: PostExpiratorSidebar
    } );


})( window.wp, config );